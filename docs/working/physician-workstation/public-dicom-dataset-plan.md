# 医生端影像后处理：公开脱敏 CT DICOM 数据计划

## 目的与边界

本清单只服务于 WT32 医生端影像后处理原型的一期验证：先验证胸部肺结节工作台，再为全身骨应用准备样本。所有数据仅用于脱敏原型的界面、DICOM 读取、叠加层和人工复核流程验证；不用于临床诊断、治疗决策、设备控制或模型性能宣称。

下载前必须阅读并遵守 [TCIA Data Usage Policies and Restrictions](https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/)。其中包括不得试图识别或联系受试者、使用时保留数据集引用，以及遵守每个下载项在 Data Access 表中注明的许可证。

## 立即下载：肺结节样板包

首批只推荐下载 TCIA 的 [Radiomic-Feature-Standards](https://www.cancerimagingarchive.net/analysis-result/radiomic-feature-standards/) 中的 **Patient Datasets（10 subjects）**。这是一期肺结节工作台的最小真实 DICOM 包，避免一开始下载完整 LIDC-IDRI 的 133.15 GB。

| 下载项 | 官方页面中的内容 | 格式与规模 | 许可证 | 一期用途 |
| --- | --- | --- | --- | --- |
| Image Data | 来自 LIDC-IDRI 的 10 例胸部 CT；每例在相关 QIN 研究中选定 1 个结节用于分析 | CT DICOM，约 1.0 GB；10 subjects / 10 studies / 10 series | CC BY 3.0 | 2D、MPR、窗宽窗位、序列/检查上下文、工作列表 |
| Segmentation Data | 与上述 10 例 CT 对应的 DICOM Segmentation Objects（DSO/DICOM SEG） | DICOM SEG，约 94 MB | CC BY 3.0 | 验证分割叠加、显示/隐藏、来源追溯与人工复核状态 |

下载入口需要 TCIA Data Retriever。页面列出的 10 个 LIDC-IDRI 患者 ID 是：`LIDC-IDRI-0314`、`0325`、`0580`、`0766`、`0771`、`0811`、`0905`、`0963`、`0965`、`1012`。下载时选择页面的 **Patient Datasets** 下两项：`Image Data (DICOM, 1.0 GB)` 与 `Segmentation Data – (DICOM, 94 MB)`；不要把 3 个 DRO 幻影或整套 LIDC-IDRI 一并作为一期必需数据下载。

该数据集的官方说明明确：10 例患者 CT 源自 LIDC-IDRI；每例为单个病灶选择一个既有 VOI，CT 与 VOI 均提供 DICOM 表达。数据引用为 McNitt-Gray et al., TCIA, DOI [10.7937/tcia.2020.9era-gg29](https://doi.org/10.7937/tcia.2020.9era-gg29)。

### 为什么它适合作为第一包

- CT 与分割均为 DICOM，能直接验证将来需要支持的 `Study → Series → Instance`、空间参考和 DICOM SEG 叠加链路，无需先自行把 NIfTI 转回 DICOM。
- 规模约 1.1 GB，适合本地开发、CI 外的人工冒烟测试和数据目录规范先行。
- 有真实影像、真实几何信息和可显示的分割对象，足以验证“AI/算法结果必须由医生复核”的 UI 数据流；但标签只应视为原型参考，不得写成诊断结论或真值保证。

## 后续肺结节扩展：按需下载，不作为首包

| 数据集 | 官方来源与内容 | 格式、规模、许可证 | 何时使用 | 注意事项 |
| --- | --- | --- | --- | --- |
| [LIDC-IDRI](https://www.cancerimagingarchive.net/collection/lidc-idri/) | 1,010 名受试者的诊断/筛查胸部 CT，并有放射科医师 XML 标注、结节计数及部分诊断数据 | CT DICOM 133.15 GB；XML 8.62 MB；CC BY 3.0 | 肺结节工作台完成首包验收后，需要更多病例和 XML 标注导入能力时 | XML 不是 DICOM SEG；应为 XML 建立独立的导入/转换适配器，不能假定与 DICOM SEG 语义完全相同。TCIA 还提示历史数据存在 Frame of Reference UID 一致性说明，应以真实验证结果处理。 |
| [DICOM-LIDC-IDRI-Nodules](https://www.cancerimagingarchive.net/analysis-result/dicom-lidc-idri-nodules/) | 将 LIDC 注释标准化为 DICOM SEG 和 SR，覆盖直径至少 3 mm 的结节 | SEG + SR DICOM，约 2.51 GB；875 subjects；CC BY 3.0 | 将来需要验证大批量 DICOM SEG/SR 解析和病灶证据引用时 | 它是派生标注，不含用于浏览的源 CT；必须另下载相匹配的 LIDC-IDRI CT，导入时验证引用的 Study/Series/SOP UID，不能按患者名称猜测匹配。 |
| [QIN-LungCT-Seg](https://www.cancerimagingarchive.net/analysis-result/qin-lungct-seg/) | 多机构肺 CT 与结节分割结果 | 原始 CT 与 SEG 合并包 3.59 GB，31 subjects / 409 series；CC BY 3.0 | 需要测试多来源、多算法/重复分割与分割来源元数据时 | 该包包含多个分割结果，适合以后验证“同一病灶多个候选算法产物”的人工复核界面；不是首批 UI 冒烟所必需。 |

## 全身骨应用的数据准备

一期可先以肺结节样板打通通用 DICOM、SEG、人工复核和报告草稿的架构；骨应用不应把“脊柱”误称为“全身骨”。为骨应用验证先后建议如下。

| 优先级 | 数据集 | 官方来源与内容 | 格式、规模、许可证 | 适用范围与限制 |
| --- | --- | --- | --- | --- |
| 第二批推荐 | [Spine-Mets-CT-SEG](https://www.cancerimagingarchive.net/collection/spine-mets-ct-seg/) | 55 例有转移性脊柱病变的 CT，含椎体层级人工分割、病灶分类及配套表格 | CT + DICOM SEG，20.36 GB；CC BY 4.0 | 能真实验证骨窗、椎体/病灶 SEG 叠加、分割复核和骨应用入口；它是脊柱样本，不足以宣称覆盖全身骨。 |
| 受限备选 | [Healthy-Total-Body-CTs](https://www.cancerimagingarchive.net/collection/healthy-total-body-cts/) | 30 名健康成人的低剂量全身 CT；另有 37 类组织标签，包括 20 类骨 | CT DICOM 58.95 GB 受 NIH Controlled Data Access Policy 限制；分割为 NIfTI，CC BY 4.0 | 可验证全身检查浏览和骨架范围，但目前影像下载受限，且 NIfTI 分割可能需要重新定向后才可与 DICOM 匹配；不作为现在的首批下载。 |
| 技术参考 | [CT-ORG](https://www.cancerimagingarchive.net/collection/ct-org/) | 140 个 CT 体数据，标有肺、骨、肝、肾、膀胱等 | NIfTI，16.9 GB；CC BY 3.0 | 可用于未来 NIfTI 分割导入/转换测试；不是 DICOM 阅片首包，不能直接替代 DICOM Study/Series/SEG 工作流。 |

## 需要随数据保留的最小内容

不要只保留截图、PNG 或经过二次压缩的切片。每个样本包应完整保留以下内容，以便验证数据结构和空间叠加：

1. 原始 CT DICOM 文件层级（含每张实例的 DICOM 元数据和像素数据）。
2. 对应的 DICOM SEG 文件；不把 SEG 烧录到 CT 像素中。
3. 原始下载说明、TCIA manifest（若下载器生成）和本数据集的 DOI/许可证记录。
4. 一个与数据分离的本地说明文件，记录下载日期、数据集版本、来源 URL 和是否包含人工/算法分割；不得添加可识别个人的信息。

一期不需要下载原始扫描投影数据、对比剂/剂量相关外部数据、PACS 导出、真实医院病历，或用于训练/微调模型的大规模数据集。

## 建议的独立目录约定（仅规划，不在本次创建）

影像数据不进入 Git 仓库。建议在仓库外建立一个独立根目录，例如 `C:\STN\data\WT32-physician-imaging`，并按来源和数据类型保留原始内容：

```text
WT32-physician-imaging/
  README-local.md
  tcia-radiomic-feature-standards/
    source-ct-dicom/
    source-seg-dicom/
    manifests-and-license/
  tcia-spine-mets-ct-seg/
    source-ct-dicom/
    source-seg-dicom/
    manifests-and-license/
```

应用数据库只保存受控的本地导入索引、不可逆样本标识和文件相对路径；原始 DICOM 文件保持只读。未来接入 PACS/DICOMweb 时以适配层替换文件索引，不迁移或改写原始像素文件。

## 下载与验证顺序

1. 在 TCIA 页面接受使用政策并安装其要求的 Data Retriever。
2. 仅下载 Radiomic-Feature-Standards 的 10 例 `Image Data` 与 10 例 `Segmentation Data`。
3. 保持 CT 与 SEG 的原始下载结构，放入独立数据根目录，不提交到 Git。
4. 后续由应用导入流程读取 DICOM 元数据并验证 SEG 对源 CT 的引用和空间关系；出现引用缺失、方向或几何不一致时显示“无法叠加/需要确认”，不得猜测或静默对齐。
5. 肺结节样板可运行并完成交互验收后，再下载 Spine-Mets-CT-SEG 作为骨应用的第二批数据。

## 来源

- [TCIA: Radiomic-Feature-Standards](https://www.cancerimagingarchive.net/analysis-result/radiomic-feature-standards/)：10 例 LIDC-IDRI CT、DICOM SEG、规模、患者 ID、许可证与 DOI。
- [TCIA: LIDC-IDRI](https://www.cancerimagingarchive.net/collection/lidc-idri/)：完整肺结节扩展集、DICOM/XML 规模、许可证与数据引用。
- [TCIA: DICOM-LIDC-IDRI-Nodules](https://www.cancerimagingarchive.net/analysis-result/dicom-lidc-idri-nodules/)：LIDC 注释的 DICOM SEG/SR 标准化表达、覆盖范围、许可证与 DOI。
- [TCIA: QIN-LungCT-Seg](https://www.cancerimagingarchive.net/analysis-result/qin-lungct-seg/)：CT + DICOM SEG 合并包及多算法分割说明。
- [TCIA: Spine-Mets-CT-SEG](https://www.cancerimagingarchive.net/collection/spine-mets-ct-seg/)：骨/脊柱 CT、DICOM SEG、分割说明、规模、许可证与 DOI。
- [TCIA: Healthy-Total-Body-CTs](https://www.cancerimagingarchive.net/collection/healthy-total-body-cts/)：全身 CT、标签内容、受限访问与方向注意事项。
- [TCIA: CT-ORG](https://www.cancerimagingarchive.net/collection/ct-org/)：NIfTI-only 的骨/器官分割技术参考。
- [TCIA Data Usage Policies and Restrictions](https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/)：使用条件、署名/引用要求和受限访问说明。
