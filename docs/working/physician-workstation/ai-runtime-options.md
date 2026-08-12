# 医生端影像后处理：AI 运行时与低成本原型路径

## 结论

一期采用 **mock-first + 本地分割运行时 + 可选 BYOK 云端适配器**：

1. 先以确定性的本地模拟结果跑通“提交任务 → 进度 → 结果叠加 → 历史候选/人工参考比较 → 人工复核 → 报告草稿引用”链路。
2. 自动分割优先接入本机或项目内网可运行的开源运行时；首选实验候选是 TotalSegmentator，MONAI 用作后续训练、推理封装或特定模型的基础设施。
3. 云端仅作为开发/演示时的可选 `Bring Your Own Key`（BYOK）适配器；不将任何免费额度、试用资格或第三方托管服务当成产品可用性的前提。
4. 用户已明确后续会使用 DeepSeek API。它只进入“智能报告解读/报告草稿辅助”能力，不用于、也不宣称能够直接完成 DICOM CT 自动分割。

WT32 当前是原型，不是临床诊断软件。所有模型结果均须标注为“辅助结果，需人工确认”，不可形成诊断结论、治疗建议或正式报告自动签发。

## 适配边界

| 能力 | 一期输入 | 推荐运行时 | 可输出的受控产物 | 明确不做 |
| --- | --- | --- | --- | --- |
| 肺结节自动分割 | 选定 CT 序列及空间信息 | mock；后续本地 MONAI/特定结节模型 | `SegmentationArtifact`、运行元数据、可复核的候选覆盖层 | 诊断、恶性判断、自动定论 |
| 全身骨应用的解剖分割 | CT 序列 | 本地 TotalSegmentator；必要时 MONAI 特定模型 | 解剖结构候选分割、显示/隐藏与人工复核状态 | “全身骨病变诊断”或骨折/转移自动结论 |
| 智能报告解读/草稿辅助 | 经人工挑选的结构化发现、测量、复核状态、模板文本 | DeepSeek 文本 API 的 BYOK 适配器 | 带来源证据的草稿建议、结构化字段建议 | 上传 DICOM 像素、替代医生、自动签发报告 |

AI 提供者接口必须把“图像分割”和“文本草稿”拆成不同 capability，禁止使用一个泛化聊天接口替代影像推理服务。

## 推荐架构

```text
Physician workstation
  └─ AI orchestration (persistent AiRun / AiArtifact / AiHumanReview)
       ├─ deterministic-mock adapter       ← 一期默认、无需外网
       ├─ local-segmentation adapter       ← TotalSegmentator / later MONAI model
       ├─ optional-modal adapter (BYOK)    ← 开发或演示时按量运行
       └─ deepseek-report adapter (BYOK)  ← 仅文本草稿辅助
```

适配器向应用层返回稳定的 `AiArtifact`，至少包含：`provider`、`provider_model`、`model_version`、`capability`、输入 Study/Series UID 引用、运行配置快照、状态、产物位置、创建时间和人工复核状态。供应商原始响应只作为受控调试/审计附件，不成为前端领域契约。

## 本地开源路径

### TotalSegmentator：全身骨应用的首选试验候选

- 官方项目支持 CT/MR 的大量解剖结构分割，可在 Windows、macOS、Linux 的 CPU 或 GPU 上运行；其模型运行时可选择 CPU/GPU，官方也明确提示无 GPU 时会很慢。[项目 README](https://github.com/wasserth/TotalSegmentator)
- 项目给出了 RTX 3090 上的资源/运行时间参考；可用 `--fast`、`--body_seg`、`--roi_subset` 与 `--force_split` 降低资源要求，但这些都是性能/分辨率权衡，不是临床质量保证。[资源要求](https://github.com/wasserth/TotalSegmentator#resource-requirements)
- 推荐用于“全身骨应用的解剖覆盖、骨窗工作台和人工复核流程”的原型验证。肺结节应用不能因其有 `lung_nodules` 任务就直接声称结节诊断能力；该任务仍需以 LIDC 样本、人工参考和人工复核评估其适用性。
- 软件仓库采用 Apache-2.0 许可证，但部分任务/权重并非开放任务，官方说明这类任务非商业用途可申请免费许可、商业使用需另行联系。每个选用 task 和权重都必须在接入前单独记录许可证，不得只依据代码仓库许可证推断。[许可证](https://github.com/wasserth/TotalSegmentator/blob/master/LICENSE)；[任务许可说明](https://github.com/wasserth/TotalSegmentator#advanced-settings)
- 不使用其在线上传服务处理真实患者资料：官方在线服务条款允许将上传数据用于改进模型，并可能以匿名形式分享，因此它只适合已经确认可公开的脱敏演示数据。[在线服务条款](https://totalsegmentator.com/terms)

### MONAI：模型集成与后续专用模型的基础设施

- MONAI 核心框架采用 Apache-2.0；其 Model Zoo 为 Bundle 格式的医疗影像模型集合，可作为训练、推理封装和后续专用肺结节/骨应用模型的基础。[MONAI](https://github.com/Project-MONAI/MONAI)；[Model Zoo](https://github.com/Project-MONAI/model-zoo)
- MONAI Label 的官方项目明确面向影像标注/推理集成，列出 DICOM、CT 与肺结节检测、全身 CT 分割等示例能力；它是后续本地服务的候选，不是一期必须引入的第二套平台。[MONAI Label](https://github.com/Project-MONAI/MONAILabel)
- 不能把“MONAI/Model Zoo 采用 Apache-2.0”理解为所有权重和训练数据均可自由商用。Model Zoo 要求逐个 Bundle 检查其软件、权重及 `docs/data_license.txt` 中的数据许可，并明确不声明模型适用于治疗或诊断用途。[Model Zoo 许可与边界](https://github.com/Project-MONAI/model-zoo#license)
- 一期不训练、不微调模型，也不把 DICOM 数据上传到公共模型仓库。先固定导入、几何校验和 DICOM SEG 导出契约；待评估了数据许可、模型许可、显卡与误差边界后，再选择一个肺结节专用模型。

### 本地运行的最低工程要求

- 原始 DICOM 留在 `C:\STN\projects\WT32-data\physician-workstation`，不进入 Git，也不被运行时改写。
- 推理前把输入快照（Series UID、实例数、几何哈希、所选模型/版本/参数）写入 `AiRun`；输出只写入独立产物目录和数据库索引。
- 输出导入前必须校验来源序列引用、Frame of Reference、体素几何和标签字典；无法匹配时显示“无法叠加，需确认”，不得静默重采样或伪造对齐。
- 本地 CPU 可用于功能验证，GPU 仅在性能验证时启用；不能以开发机上的运行时间推断临床可用性。

## 云端开发额度与限制（仅作可选实验）

| 平台 | 官方确认的开发优惠/定价 | 原型适配价值 | 不应依赖的原因 |
| --- | --- | --- | --- |
| Modal | Starter 计划为 $0，当前含每月 $30 计算额度；按实际计算时间计费。官方还提供面向早期创业公司和学术研究者的申请式额度计划。[定价](https://modal.com/pricing) | 可把开源分割容器按需跑在 GPU 上，适合内部演示、短批任务与运行时适配验证。 | 使用 Modal 需绑定支付方式；额度和价格可变。不能把每月 $30 视为 SLA、持续供给或生产预算。[账单要求](https://modal.com/docs/guide/billing) |
| Hugging Face Inference Providers | 免费账户当前每月 $0.10 推理额度，官方注明“可变”；用自带 provider key 时此额度不适用。[定价](https://huggingface.co/docs/inference-providers/en/pricing) | 适合测试文本/小模型请求路由，不建议将其作为 3D CT 分割生产路径。 | Dedicated Inference Endpoints 需有效支付方式、按量计费；并非免费端点。[Endpoint 访问与计费](https://huggingface.co/docs/inference-endpoints/guides/access) |
| Hugging Face Spaces | CPU Basic 硬件当前标注为免费；但 Gradio/Docker Space 的创建要求付费计划，免费个人账户例外是最多 2 个 ZeroGPU Gradio Spaces，且共享资源/资格规则可能调整。[Spaces 说明](https://huggingface.co/docs/hub/spaces-overview) | 只适合公开脱敏 demo 或临时可视化实验。 | 公共 Space 代码与应用对外可见；免费硬件会休眠，且并不构成对医疗资料的处理授权。 |
| Google Cloud | 合资格新用户当前可获 90 天、$300 Welcome credit；试用到期或余额用尽会自动关闭，部分产品可能受限。[免费试用 FAQ](https://cloud.google.com/signup-faqs) | 若团队已有 GCP 能力，可在封顶预算内验证自建容器/批处理。 | 资格、地域、可用产品和试用条件会变化；试用不是生产资源，也不自动授予 PHI 处理资格。 |
| AWS | 2025-07-15 后新客户首次获 $100 credits，并可经控制台活动最多再获 $100；Free Plan 在注册后 6 个月或额度耗尽时结束。[官方公告](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/)；[Free Tier 说明](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html) | 可用于有 AWS 经验时的一次性容器/批推理试验。 | 免费计划与 credit 期限/资格并不等同，且环境配置和成本控制工作量高于 Modal；不作为一期默认路径。 |
| Azure | 合资格新用户当前有首 30 天 $200 credit，额度耗尽或 30 天到期会停用服务，升级后才可继续。[官方说明](https://learn.microsoft.com/azure/cost-management-billing/manage/avoid-charges-free-account) | 已在 Azure 内部环境的团队可在受限试用中验证容器化服务。 | 仅适合已有 Azure 治理的团队；免费账户不是可持续运行时，也不自动满足医疗数据处理要求。 |

任何云端提供者：免费/试用额度只能用于公开、合法、已脱敏的样本和成本探索。不得把真实患者资料、可识别信息、生产 DICOM 或 API 密钥写入客户端、日志、公开仓库或公共演示服务。

Modal 的官方隐私文档还规定：若处理 PHI，必须在提交 PHI 前与其建立 BAA，且限 Enterprise；其部分存储/镜像区域也不在 BAA 承诺范围内。因此 WT32 一期不得以 Starter 额度处理 PHI。[Modal 安全与隐私](https://modal.com/docs/guide/security)

## DeepSeek API：报告草稿辅助，而非影像分割

- DeepSeek 官方 API 当前公开的是 OpenAI/Anthropic 兼容的文本模型接口、JSON 输出和工具调用；当前模型列表与价格应以其官方价格页为准。[模型与价格](https://api-docs.deepseek.com/quick_start/pricing)；[模型列表接口](https://api-docs.deepseek.com/api/list-models)
- 官方最新资料显示 V4 API 是文本模型；其 GitHub Copilot 集成文档明确写明 V4 为 text-only，图像描述由其他模型代理处理。因此不能把 DeepSeek API 设计为接收 DICOM 像素并生成 CT 分割的后端。[官方说明](https://api-docs.deepseek.com/quick_start/agent_integrations/github_copilot/)
- 本次核验未找到 DeepSeek 官方 API 文档中承诺给所有新用户的固定免费 API 额度。官方价格页说明费用从充值余额或赠送余额中扣除，赠送余额是否存在应以账户控制台实际显示为准；工程规划不得将其假设为必有额度。[扣费规则](https://api-docs.deepseek.com/quick_start/pricing)
- 建议 DeepSeek 的调用输入只包含经人工选择的、去标识化的结构化事实和模板片段，例如“已复核的测量值、医生勾选的所见、引用的序列描述”；输出必须保存为可编辑 `ReportDraftRevision`，且显示模型、版本、提示词模板版本、源证据和人工修改/接受/忽略状态。
- 不向 DeepSeek 发送整套 DICOM、像素数据、姓名/ID/日期等可识别信息；不要求它输出诊断结论、风险分层或治疗建议。它的作用是把人工已确认的事实组织为候选文本，而不是解释原始影像。

## OpenAI API：结论限定

本次仅为“是否存在可依赖的免费 API 额度”做核验。OpenAI 官方帮助文档说明新 API 账户采用预付费，购买起点为 $5；文档提到“如账户已有免费余额会优先扣除”，但没有给出普适、固定的新用户免费 API 额度。官方促销服务额度是按资格和活动决定的，并非标准权益；其 Researcher Access Program 可申请最高 $1,000 API 额度，但限定支持地区及学术/非营利研究资格，不能作为本项目的默认路径。[预付费说明](https://help.openai.com/en/articles/8264778-what-is-prepaid-billing)；[服务额度条款](https://openai.com/policies/service-credit-terms/)；[Researcher Access Program](https://help.openai.com/en/articles/10139500-researcher-access-program-faq)

用户当前已决定后续采用 DeepSeek，因此 OpenAI 不列入一期集成计划。

## 分阶段执行建议

1. **一期默认：** `deterministic-mock`。用现有 LIDC-IDRI-0314 的人工 SEG、历史候选 SEG 和派生的模拟候选，验证数据结构与医生复核体验；不依赖网络、额度或模型质量。
2. **一期可选技术验证：** 为 TotalSegmentator 增加本地运行时适配器，先只运行一个许可明确、输出可解释的 task，产物作为“外部算法候选结果”。若有合规的公开样本且本机无 GPU，可用 Modal 的独立开发环境短期验证同一容器。
3. **报告草稿：** 在持久化 `AiRun`、`AiArtifact`、`AiHumanReview`、`ReportDraftRevision` 完成后，再增加 DeepSeek BYOK 文本适配器；默认关闭，需由部署者提供服务端密钥并配置花费上限。
4. **二期前门槛：** 针对肺结节和全身骨分别完成数据/权重许可证审查、样本几何兼容性、运行性能、失败模式、人工复核可用性和撤回/重跑规则，再决定是否把本地模型作为默认可选项。

## 不可省略的安全与成本约束

- 免费额度、试用与社区 GPU 授予均可被取消或限制；它们只降低研发试错成本，不能成为上线依赖。
- API Key 只存服务端密钥管理，不进入 React 构建产物、浏览器 localStorage、提交记录或病例导出。
- 每个云适配器均须有明确开关、每次任务的费用/额度可观测性、超额失败状态和无云端时的 mock 回退；不能无提示重试造成费用增长。
- 所有 AI 产物均须允许医生“接受、编辑、忽略或驳回”，且必须可追溯到输入序列和运行版本。

## 资料核验日期

2026-08-07。价格、免费额度、模型版本和服务限制均可能变化；实现或开通账户前必须再次访问链接确认。
