# WT32 控制端 DOM（Dynamic Organ Dose Modulation，动态器官剂量调节）功能调研报告

> 版本：V0.1  
> 适用项目：JennyTuan/WT32  
> 输出目标：为 WT32 控制端软件新增 DOM 功能提供需求调研、竞品分析与产品落地建议。  
> 说明：当前无法联网实时检索官网资料，竞品部分基于 CT 行业通用产品形态与已知公开知识整理，后续正式评审前建议再用各厂家最新用户手册/白皮书复核。

---

## 1. 结论摘要

WT32 当前已经具备新增 DOM 功能的基础：

1. 项目定位是 **CT 扫描仪控制与管理系统原型**，覆盖患者管理、协议管理、完整扫描工作流、4D 扫描、DICOM 查看、设备服务功能等；前端以 **1024×768 平板外壳**模拟设备屏幕。
2. 后端扫描参数模型中，`topogram_params`、`helical_params`、`axial_params` 以及对应的 `scan_session_*_params` 已经存在 `dom` 字段，同时已有 `ctdi_vol`、`dlp` 字段。
3. 前端已有 `/protocol-detail/dose` 剂量/通知阈值页面，当前主要展示 CTDIvol、DLP 参考值与通知阈值，但尚未形成真正的器官剂量调节配置。
4. 螺旋参数页面已经出现 `DOM (动态扫描)` 字段，但当前是普通输入项，语义不够清晰，也未与器官保护、角度调制、自动 mA、剂量预估、扫描确认告警联动。
5. 扫描会话从协议模板克隆时，会把 `ctdi_vol`、`dlp`、`auto_ma`、`ma_min`、`ma_max` 等关键剂量相关字段复制到本次扫描会话，但目前克隆逻辑没有完整复制 `dom` 字段，需要补齐。

因此，DOM 功能不建议作为一个独立孤岛页面实现，而应作为 **协议参数、扫描确认、剂量通知、执行监控、剂量日志**之间的贯穿式功能。

推荐产品定义：

> DOM 是控制端提供给技师的“器官保护型剂量调节配置与安全确认能力”。控制端负责选择保护器官/保护方向、展示预计剂量变化、完成扫描前风险确认、将 DOM 配置下发给扫描控制/剂量计算模块，并记录本次扫描的 DOM 状态与剂量结果。真正的 mA 角度调制曲线、曝光控制、硬件安全限制，应由底层扫描控制、剂量引擎或硬件控制层负责。

---

## 2. WT32 现有项目基础分析

### 2.1 项目形态

WT32 是一个 CT 控制端原型项目，技术栈包括：

- 后端：FastAPI + SQLite + SQLAlchemy + Pydantic
- 前端：React + TypeScript + Vite + Tailwind CSS
- 图像查看：Cornerstone3D
- 本地协议库：Dexie / IndexedDB

README 中明确项目包含：

- 患者管理
- 扫描协议管理
- 定位像 → 螺旋扫描 → 图像重建的普通扫描工作流
- 4D 呼吸门控扫描
- DICOM 图像查看
- 设备服务功能
- 1024×768 平板外壳模拟设备屏幕

这意味着 DOM 需要优先考虑 **控制端工作流体验**，而不是单纯做一个技术参数配置页。

---

### 2.2 已有剂量相关能力

当前项目已有剂量相关入口和字段：

#### 2.2.1 路由层

前端已注册：

- `/protocol-detail/dose`：协议详情中的剂量通知页面
- `/service/dose/settings`：剂量设置，占位
- `/service/dose/logs`：剂量日志，占位

#### 2.2.2 数据模型层

后端模型中，以下参数表已有 `dom` 字段：

- `TopogramParam.dom`
- `HelicalParam.dom`
- `AxialParam.dom`
- `ScanSessionTopogramParam.dom`
- `ScanSessionHelicalParam.dom`
- `ScanSessionAxialParam.dom`

同时已有剂量字段：

- `ctdi_vol`
- `dlp`
- `auto_ma`
- `ma_min`
- `ma_max`

这些字段说明项目已经具备剂量调节参数落库的基础。

#### 2.2.3 前端类型层

`scanSession.ts` 中，前端 API 类型已经包含 `dom`、`ctdi_vol`、`dlp`、`auto_ma`、`ma_min`、`ma_max` 等字段，并提供了更新本次扫描参数的 API 方法：

- `updateSelectedScanSessionTopogramParam`
- `updateSelectedScanSessionHelicalParam`
- `updateSelectedScanSessionAxialParam`

这说明 DOM 可以较自然地接入现有“本次扫描参数编辑”机制。

---

### 2.3 当前问题

#### 问题 1：`dom` 字段存在，但语义不清

当前 `dom` 是 `String(20)` / `Optional[str]`，前端螺旋页面显示为 `DOM (动态扫描)`，默认值为 `0`。

这存在几个问题：

- DOM 在 CT 语境下不应被解释为“动态扫描”，而应明确为 **Dynamic Organ Dose Modulation / Organ Dose Modulation**。
- `0` 作为值不利于理解，建议改为枚举式表达，例如：
  - `off`
  - `anterior`
  - `breast`
  - `thyroid`
  - `eye_lens`
  - `gonad`
  - `custom`
- 单一字符串不足以承载完整配置，例如保护器官、保护方向、强度等级、是否自动识别定位像、是否允许补偿 mA、预计剂量变化等。

#### 问题 2：剂量页面仍是静态阈值页

`WT32NewProtocolDoseDetailScreen.tsx` 当前主要展示：

- CTDIvol 参考
- DLP 参考
- CTDI 通知阈值
- DLP 通知阈值
- 一键应用系统 DRL

但缺少：

- DOM 开关
- 保护器官选择
- 保护方向/角度范围
- 剂量降低预计值
- 图像噪声影响提示
- 与自动 mA 的关系说明
- 扫描前确认逻辑
- 禁用/风险场景说明

#### 问题 3：扫描会话克隆逻辑没有完整复制 DOM

`scan_sessions.py` 在从协议模板克隆扫描会话时，复制了 CTDIvol、DLP、auto mA、mA 上下限等字段，但从当前代码看，`dom` 没有被完整复制到 session 参数。

这会导致：

- 协议模板中配置了 DOM，但进入本次扫描会话后可能丢失。
- 扫描确认页读取本次扫描会话时，无法知道 DOM 状态。
- 日志或剂量追踪无法还原当次扫描是否启用 DOM。

#### 问题 4：扫描确认页剂量展示偏“定位像剂量”

`ScanConfirmScreen` 当前有 `ScoutDoseDisplayParams`，展示 CTDIvol、DLP、通知阈值等，但剂量展示逻辑更偏定位像剂量，不足以表达螺旋/断层扫描 DOM 的预估剂量变化。

---

## 3. DOM 功能定义

### 3.1 DOM 是什么

DOM，即 Dynamic Organ Dose Modulation，动态器官剂量调节。

在 CT 控制端产品中，可以理解为：

> 在扫描过程中，根据人体解剖方向、保护器官位置、扫描角度范围和自动 mA 调制策略，对特定角度或特定区域的管电流进行降低或限制，从而减少乳腺、晶状体、甲状腺、性腺等辐射敏感器官的受照剂量。

需要注意：  
DOM 不等于简单降低整段 mA。它通常是 **与角度、器官位置、扫描范围、自动 mA、图像质量目标联动的剂量调节策略**。

---

### 3.2 控制端软件的职责边界

WT32 是控制端软件，因此 DOM 的职责应明确边界。

#### 控制端应该负责

1. 提供 DOM 配置入口。
2. 根据扫描部位、患者体位、扫描方向、协议类型，推荐可保护器官。
3. 展示 DOM 状态：
   - 未启用
   - 已启用
   - 自动推荐
   - 与当前扫描模式不兼容
   - 需要确认
4. 展示剂量影响：
   - 预计保护器官剂量降低趋势
   - CTDIvol / DLP 预估变化
   - 图像噪声或前方结构图像质量可能受影响的提示
5. 在扫描确认页进行二次确认。
6. 将 DOM 配置下发给后端/扫描控制服务。
7. 记录本次扫描是否启用 DOM、启用原因、用户确认、预计剂量和实际剂量。

#### 控制端不应该负责

1. 不应该在 UI 层计算真实 mA 角度调制曲线。
2. 不应该绕过硬件安全限制直接控制曝光。
3. 不应该在没有底层校验的情况下允许技师任意设置危险剂量参数。
4. 不应该把 DOM 描述为绝对剂量降低承诺，只能显示“预计/模拟/参考”。

---

## 4. 竞品分析

> 以下为行业通用方向整理，正式文档中建议用 Siemens、GE、Philips、Canon、United Imaging 等厂商最新用户手册进一步核验具体名称、参数项和 UI 细节。

### 4.1 Siemens：器官保护型角度调制思路

#### 典型能力

Siemens CT 产品中常见的剂量优化体系包括自动管电流调制和器官保护功能。其器官保护思路通常是：

- 对人体前方敏感器官区域降低管电流。
- 在其他角度进行一定补偿，以维持整体图像质量。
- 常用于乳腺、眼晶状体、甲状腺等前方敏感器官保护。
- 通常与自动曝光控制、CARE Dose 体系协同。

#### 对 WT32 的启发

1. DOM 不应只做“开/关”，而应表达 **保护方向**。
2. 对前方器官保护时，需要结合患者体位：
   - HFS / FFS
   - HFP / FFP
   - 仰卧 / 俯卧
3. 需要在扫描确认页提示：
   - DOM 已启用
   - 保护方向
   - 可能影响前方区域噪声
4. 不建议让技师自由输入角度，应优先提供“器官/方向模板”。

---

### 4.2 GE：自动 mA 与器官保护联动思路

#### 典型能力

GE CT 的剂量管理通常强调自动 mA 调制、噪声指数、患者体型适配、协议级剂量管理等。在器官剂量保护方向上，常见产品思路是：

- 基于定位像或患者尺寸进行自动 mA 调制。
- 在协议中设置剂量目标和约束。
- 对敏感区域进行局部剂量优化。
- 通过扫描前剂量检查、剂量报告和日志支撑合规。

#### 对 WT32 的启发

1. DOM 应与 `auto_ma` 结合，不应作为孤立字段。
2. 如果 `auto_ma = false`，DOM 的行为应明确：
   - 禁用 DOM；
   - 或允许“固定 mA 下的角度降幅”，但需要底层支持。
3. 剂量设置应支持：
   - mA 上限
   - mA 下限
   - 保护强度
   - 图像质量优先 / 器官保护优先
4. 需要在剂量日志中记录：
   - 启用 DOM 前预计 CTDIvol / DLP
   - 启用 DOM 后预计 CTDIvol / DLP
   - 实际扫描剂量

---

### 4.3 Philips：DoseRight / DoseWise 类剂量管理思路

#### 典型能力

Philips 的剂量管理体系通常强调：

- 根据患者体型、检查部位、协议参数进行剂量优化。
- 提供剂量通知、剂量警示、剂量记录。
- 在临床工作流中尽量减少操作负担。
- 强调协议级配置与扫描前确认。

#### 对 WT32 的启发

1. DOM 入口不宜太深，应与协议编辑和扫描确认强关联。
2. 技师不应每次都复杂配置，应支持协议模板预设。
3. 对常见部位提供默认保护策略：
   - 头颈部：晶状体 / 甲状腺
   - 胸部：乳腺
   - 盆腔：性腺
4. 对不适用场景给出清晰提示，而不是隐藏功能。

---

### 4.4 Canon：SUREExposure 类自动曝光思路

#### 典型能力

Canon CT 的剂量优化通常强调自动曝光控制、图像质量目标、患者体型适配、协议参数联动等。器官保护功能如果存在，通常也会与自动曝光控制协同，而不是作为单纯手动参数。

#### 对 WT32 的启发

1. DOM 应融入“协议参数体系”，不是单独做一个高级隐藏参数。
2. UI 应突出“推荐值”和“系统计算结果”，减少自由输入。
3. 对儿童、婴幼儿协议要特别谨慎，默认策略应更保守。

---

### 4.5 联影 / 国产厂商方向

#### 典型趋势

国产 CT 控制端通常会将剂量能力整合为：

- KV 推荐
- mA 调制
- 电压选项
- 剂量等级
- 参考 mAs / 平均 mA
- 剂量通知 / 剂量报告
- 协议级剂量配置

#### 对 WT32 的启发

1. WT32 现有字段中已有 `auto_ma`、`ma_min`、`ma_max`，可以扩展为更完整的“智能剂量调节”模块。
2. DOM 可以作为 WT-Dose 的一个子功能，而不是单独散落在螺旋参数页。
3. 建议产品命名可统一为：
   - `WT-Dose 智能剂量调节`
   - 子功能：`器官剂量保护 DOM`
   - 子功能：`mA 自动调制`
   - 子功能：`剂量通知阈值`
   - 子功能：`剂量日志`

---

## 5. WT32 中 DOM 的推荐产品定位

### 5.1 功能名称建议

中文名称：

> 器官剂量保护

英文名称：

> Dynamic Organ Dose Modulation / DOM

界面显示建议：

> DOM 器官剂量保护

不建议继续使用：

> DOM（动态扫描）

原因：容易与 4D 动态扫描、动态采集混淆。

---

### 5.2 用户角色

主要用户：

- 放射科技师

次要用户：

- 应用工程师
- 物理师 / 剂量管理员
- 科室管理员
- 研发/测试人员

---

### 5.3 典型使用场景

#### 场景 1：胸部 CT，保护乳腺

- 协议：胸部常规 / 胸部低剂量 / 胸部增强
- 患者：女性、儿童或年轻患者
- 保护器官：乳腺
- DOM 策略：前方角度降低 mA
- UI 提示：可能增加前胸壁区域噪声，建议结合诊断目的确认。

#### 场景 2：头部 CT，保护眼晶状体

- 协议：头颅平扫 / 鼻窦 / 眼眶
- 保护器官：晶状体
- DOM 策略：前方眼部区域降剂量
- UI 提示：若眼眶区域为主要诊断目标，应谨慎启用或降低保护强度。

#### 场景 3：颈部 CT，保护甲状腺

- 协议：颈部软组织 / 颈椎 / 头颈 CTA
- 保护器官：甲状腺
- DOM 策略：前方颈部敏感区域降剂量
- UI 提示：若甲状腺本身是诊断重点，应提示确认。

#### 场景 4：盆腔 CT，保护性腺

- 协议：盆腔平扫 / 下腹部扫描
- 保护器官：性腺
- DOM 策略：按扫描范围与体位判断是否可启用
- UI 提示：扫描范围覆盖敏感器官时才有意义。

---

## 6. 功能需求设计

### 6.1 功能入口设计

建议保留三个入口，但各自职责不同。

#### 入口 1：协议详情 > 剂量 / 通知阈值

当前已有 `/protocol-detail/dose`，建议扩展为：

> 剂量 / DOM / 通知阈值

页面分区：

1. 剂量参考与 DRL
2. DOM 器官剂量保护
3. 通知阈值
4. 剂量预估与风险提示

#### 入口 2：螺旋 / 断层参数页

当前螺旋参数页已有 `DOM (动态扫描)` 字段。

建议改为只显示摘要，不在这里展开复杂配置：

- DOM：关闭 / 已启用
- 保护器官：乳腺 / 晶状体 / 甲状腺 / 性腺
- 按钮：配置

这样避免扫描参数页过度拥挤。

#### 入口 3：扫描确认页

扫描前必须显示 DOM 状态：

- 当前序列是否启用 DOM
- 保护器官
- 保护方向
- 预计剂量变化
- 是否需要用户确认

如果 DOM 影响较大，应弹出确认：

> 当前序列已启用 DOM 器官剂量保护：乳腺。系统将降低前方角度剂量，可能导致前胸壁区域噪声升高。请确认该设置符合本次检查目的。

---

### 6.2 DOM 配置项

#### 基础配置

| 字段 | 类型 | 建议值 | 说明 |
|---|---|---|---|
| DOM 开关 | enum | off / on / auto | 关闭、开启、自动推荐 |
| 保护器官 | enum/list | breast / eye_lens / thyroid / gonad / custom | 可支持多选，但 MVP 建议单选 |
| 保护方向 | enum | anterior / posterior / left / right / auto | MVP 推荐 anterior / auto |
| 保护强度 | enum | low / medium / high | 不建议直接让用户输入百分比 |
| 适用序列 | enum/list | helical / axial | MVP 优先 helical |
| 是否与 auto mA 联动 | boolean | true / false | 推荐默认 true |
| 图像质量优先级 | enum | balanced / dose_saving / image_quality | 平衡、剂量优先、图像质量优先 |

#### 高级配置

| 字段 | 类型 | 说明 |
|---|---|---|
| angle_start | number | 起始角度，建议仅工程模式可见 |
| angle_end | number | 结束角度，建议仅工程模式可见 |
| reduction_level | number | 降低强度，建议由等级映射 |
| compensation_enabled | boolean | 是否允许其他角度补偿 |
| min_ma_floor | number | 最低 mA 限制 |
| max_noise_increase | number | 可接受噪声增加范围 |
| reason_required | boolean | 高风险场景是否要求填写原因 |

---

### 6.3 自动推荐规则

DOM 推荐不应完全手动，建议基于以下条件自动推荐：

| 条件 | 推荐逻辑 |
|---|---|
| body_part = CHEST | 推荐乳腺保护 |
| body_part = HEAD | 推荐晶状体保护，但眼眶/鼻窦协议需谨慎 |
| body_part = NECK | 推荐甲状腺保护 |
| body_part = PELVIS | 推荐性腺保护 |
| age_group = child / infant | 提高推荐优先级 |
| patient gender = female 且胸部扫描 | 提高乳腺保护推荐优先级 |
| scan_mode = 4d | 谨慎启用，需结合 4D 采集策略 |
| auto_ma = false | 提示 DOM 可能不可用或效果受限 |
| scan_length 太短 | 提示收益有限 |
| 当前诊断目标包含保护器官 | 提示谨慎启用 |

---

### 6.4 禁用与风险场景

以下场景建议禁用或强提示：

| 场景 | 处理方式 |
|---|---|
| 定位像 | 默认不启用 DOM |
| 保护器官本身是诊断目标 | 强提示确认 |
| auto mA 未开启且底层不支持固定 mA 角度调制 | 禁用 |
| 患者体位未知 | 禁用或要求确认体位 |
| 扫描方向未知 | 禁用 |
| 4D 扫描 | MVP 阶段建议暂不启用，后续单独评估 |
| 儿童协议 | 可推荐，但强度不应由用户任意输入 |
| 金属伪影严重区域 | 提示剂量调节可能影响图像质量 |

---

## 7. 数据模型建议

### 7.1 MVP 方案：复用现有 `dom` 字段

现有模型已有 `dom` 字段，MVP 可以先将其规范化为枚举字符串：

```ts
type DomMode =
  | "off"
  | "auto"
  | "breast"
  | "eye_lens"
  | "thyroid"
  | "gonad"
  | "custom";
```

优点：

- 改动小。
- 可以快速接入现有 `TopogramParam`、`HelicalParam`、`AxialParam`、`ScanSession*Param`。
- 前后端类型已有基础。

缺点：

- 无法承载完整配置。
- 不利于后续扩展。
- 无法记录保护方向、强度、角度范围、确认状态等。

适合阶段：

> 原型验证 / 第一版 UI 演示。

---

### 7.2 推荐方案：新增 DOM 配置字段或配置表

建议中期新增结构化字段。

#### 方案 A：在参数表中增加 JSON 字段

新增字段：

```python
dom_config = Column(Text, nullable=True)
```

JSON 示例：

```json
{
  "enabled": true,
  "mode": "auto",
  "protected_organ": "breast",
  "direction": "anterior",
  "strength": "medium",
  "linked_auto_ma": true,
  "compensation_enabled": true,
  "estimated_ctdi_before": 8.4,
  "estimated_ctdi_after": 7.6,
  "estimated_dlp_before": 320.0,
  "estimated_dlp_after": 292.0,
  "image_quality_notice": "前胸壁区域噪声可能轻度升高",
  "requires_confirmation": true,
  "confirmed_by": null,
  "confirmed_at": null
}
```

优点：

- 兼容性好。
- 不需要立即拆多张表。
- 适合原型项目。

缺点：

- 查询统计不如结构化表方便。

#### 方案 B：新增 `organ_dose_modulation_configs` 表

字段建议：

| 字段 | 说明 |
|---|---|
| id | 主键 |
| target_type | protocol / scan_session |
| target_param_type | topogram / helical / axial |
| target_param_id | 参数 ID |
| enabled | 是否启用 |
| mode | off / auto / manual |
| protected_organ | 保护器官 |
| direction | 保护方向 |
| strength | 保护强度 |
| linked_auto_ma | 是否联动 auto mA |
| compensation_enabled | 是否补偿 |
| estimated_ctdi_before | 启用前预计 CTDIvol |
| estimated_ctdi_after | 启用后预计 CTDIvol |
| estimated_dlp_before | 启用前预计 DLP |
| estimated_dlp_after | 启用后预计 DLP |
| warning_level | none / notice / warning / block |
| confirmation_status | none / required / confirmed |
| created_at | 创建时间 |
| updated_at | 更新时间 |

适合阶段：

> 产品化版本 / 需要剂量日志、审计、统计时。

---

### 7.3 必须修复：扫描会话克隆 DOM 字段

当前 `scan_sessions.py` 克隆协议模板到本次扫描会话时，建议补齐：

```python
dom=series.helical_param.dom
```

同理补齐：

```python
dom=series.topogram_param.dom
dom=series.axial_param.dom
```

否则协议模板配置不会进入本次扫描流程。

---

## 8. 页面设计建议

### 8.1 协议详情页：剂量 / DOM / 通知阈值

当前页面右侧为剂量参考与通知阈值。建议改造为四块：

#### A. 剂量参考

保留：

- CTDIvol
- DLP
- 一键应用系统 DRL

#### B. DOM 器官剂量保护

新增：

- DOM 开关
- 推荐状态：
  - 系统推荐
  - 用户手动开启
  - 当前协议不适用
- 保护器官：
  - 乳腺
  - 晶状体
  - 甲状腺
  - 性腺
  - 自定义
- 保护强度：
  - 低
  - 中
  - 高
- 自动 mA 联动：
  - 开启
  - 关闭
- 图像质量提示

#### C. 剂量预估

展示：

| 指标 | 启用前 | 启用后 | 变化 |
|---|---:|---:|---:|
| CTDIvol | 8.4 mGy | 7.6 mGy | -9.5% |
| DLP | 320 mGy·cm | 292 mGy·cm | -8.8% |
| 保护器官剂量 | 参考值 | 预计降低 | 仅供参考 |

#### D. 通知阈值

保留当前 CTDI / DLP 通知阈值。

---

### 8.2 螺旋参数页

当前螺旋参数页有 `DOM (动态扫描)` 字段。建议替换为：

```text
DOM 器官剂量保护：已启用
保护器官：乳腺
保护强度：中
[配置]
```

不要让用户在这里直接输入 `0` 或字符串。

---

### 8.3 扫描确认页

扫描确认页应增加 DOM 状态条：

```text
DOM 器官剂量保护：已启用｜保护器官：乳腺｜强度：中｜预计 CTDIvol -9.5%
```

若存在风险：

```text
注意：当前保护器官可能位于诊断关注区域，启用 DOM 可能影响局部图像噪声，请确认。
[返回修改] [确认并继续]
```

---

### 8.4 服务模式：剂量设置

`/service/dose/settings` 当前是占位页。

建议用于配置系统级策略：

- 是否允许 DOM
- 默认保护强度
- 儿童协议是否默认推荐
- 哪些检查部位默认推荐
- 是否必须二次确认
- 是否允许用户覆盖协议默认值
- 是否显示剂量预估百分比
- 是否要求审计日志

---

### 8.5 服务模式：剂量日志

`/service/dose/logs` 当前是占位页。

建议记录：

- 患者 ID
- 检查协议
- 扫描序列
- 是否启用 DOM
- 保护器官
- 保护强度
- 用户确认人
- 确认时间
- 预计 CTDIvol / DLP
- 实际 CTDIvol / DLP
- 是否超过通知阈值
- 是否发生用户覆盖

---

## 9. 工作流设计

### 9.1 协议模板配置流程

```text
进入协议详情
→ 选择某个采集序列
→ 进入剂量 / DOM / 通知阈值
→ 系统根据 body_part / age_group / scan_mode 推荐 DOM
→ 用户确认保护器官与强度
→ 保存协议模板
```

---

### 9.2 本次扫描调整流程

```text
患者列表
→ 选择患者
→ 选择协议
→ 创建 scan_session
→ 协议参数克隆到本次扫描
→ 扫描确认页显示 DOM 状态
→ 如需修改，返回协议详情或参数详情
→ 用户确认
→ 下发扫描
→ 执行扫描
→ 保存剂量日志
```

---

### 9.3 扫描前安全确认流程

```text
点击执行扫描
→ 检查 DOM 状态
→ 检查体位、扫描方向、保护器官、auto mA
→ 如果全部通过：进入扫描
→ 如果存在风险：弹出确认
→ 如果不兼容：阻止扫描并提示修改
```

---

## 10. 与 4D 扫描的关系

WT32 当前已经有 4D 呼吸门控流程，包括诊断确认、断层采集、时相回顾、重扫选择等。

DOM 与 4D 的关系需要谨慎：

### MVP 建议

第一版不建议在 4D 扫描中启用 DOM。

原因：

1. 4D 扫描本身涉及多时相、多床位、呼吸周期。
2. 剂量分布与重建相位、重扫选择相关。
3. DOM 可能影响不同相位之间的图像一致性。
4. 需要底层剂量引擎支持更复杂的时相/角度/床位调制。

### 后续增强

可在 4D 中增加：

- 是否允许 DOM
- 仅诊断扫描启用
- 治疗计划 4D 禁用
- 重扫区域是否继承 DOM
- 每个床位剂量区可视化

---

## 11. 技术实现建议

### 11.1 第一阶段：低侵入 MVP

目标：让 DOM 在 UI、数据、扫描确认中闭环。

#### 后端

1. 规范 `dom` 字段枚举值。
2. 修改 `schemas.py`：
   - 将 `dom` 从 `Optional[str]` 逐步规范为 Literal 或前端枚举。
3. 修改 `scan_sessions.py`：
   - 协议模板克隆到扫描会话时复制 `dom`。
   - duplicate session series 时复制 `dom`。
4. 在 scan session 更新接口中允许更新 `dom`。

#### 前端

1. 修改 `WT32NewProtocolDoseDetailScreen`：
   - 增加 DOM 配置卡片。
2. 修改 `WT32NewProtocolHelicalDetailScreen`：
   - 将 `DOM (动态扫描)` 改为 `DOM 器官剂量保护`。
   - 不再使用自由输入，改为状态 + 配置入口。
3. 修改 `ScanConfirmScreen`：
   - 显示当前序列 DOM 状态。
   - 如果启用 DOM，展示保护器官与剂量影响。
4. 修改 `scanSession.ts`：
   - 类型中保留 `dom`，增加前端枚举。
   - 更新后刷新本地缓存。

---

### 11.2 第二阶段：结构化 DOM 配置

目标：支持完整器官保护配置。

新增：

- `dom_config` JSON 字段，或新增 DOM 配置表。
- 剂量预估接口：
  - `/api/dose/estimate`
- DOM 推荐接口：
  - `/api/dose/dom/recommend`
- DOM 兼容性检查接口：
  - `/api/dose/dom/validate`

---

### 11.3 第三阶段：与扫描控制服务联动

目标：接入真实扫描控制链路。

需要与硬件/算法团队明确：

1. DOM 下发参数格式。
2. 是否支持角度 mA 调制。
3. 是否支持按器官模板下发。
4. 是否支持自动 mA 联动。
5. mA 最低值、最高值、变化斜率限制。
6. CTDIvol / DLP 是扫描前预估还是扫描后回传。
7. 实际曝光曲线是否可回传。
8. 剂量日志是否需要 DICOM Dose SR 或 RDSR 支持。

---

## 12. 产品风险与注意事项

### 12.1 不要承诺“确定降低某器官剂量多少”

控制端只能展示：

- 预计
- 参考
- 模拟
- 基于当前协议参数估算

不能绝对承诺实际器官剂量降低百分比。

---

### 12.2 不要只做开关

DOM 如果只是一个开关，临床价值不足，也容易让技师误用。

至少应表达：

- 保护哪个器官
- 为什么推荐
- 是否影响图像质量
- 是否需要确认
- 是否被记录

---

### 12.3 不要和 4D 动态扫描混淆

当前螺旋页面的 `DOM (动态扫描)` 容易造成概念混淆。

建议统一文案：

- DOM 器官剂量保护
- Organ Dose Modulation
- 不使用“动态扫描”描述 DOM

---

### 12.4 注意本次扫描与模板的关系

DOM 也需要区分：

- 协议模板默认 DOM
- 本次扫描临时修改 DOM
- 修改是否回写模板
- 修改是否需要权限

---

## 13. 建议优先级

### P0：必须做

1. 明确 DOM 概念与文案。
2. 修复 `dom` 从协议模板克隆到扫描会话的问题。
3. 在协议剂量页增加 DOM 配置卡片。
4. 在扫描确认页显示 DOM 状态。
5. 在螺旋参数页将 `DOM (动态扫描)` 改为 `DOM 器官剂量保护`。
6. 增加启用 DOM 时的扫描前提示。

### P1：建议做

1. 根据部位自动推荐保护器官。
2. 增加保护强度。
3. 增加与 auto mA 的联动提示。
4. 增加服务模式剂量设置。
5. 增加剂量日志页面。

### P2：后续增强

1. 增加定位像自动识别保护区域。
2. 增加器官保护区域可视化。
3. 增加真实剂量预估接口。
4. 增加与硬件扫描控制服务联动。
5. 支持 4D 场景下的 DOM 策略。

---

## 14. 推荐 MVP 范围

### 14.1 MVP 功能清单

| 模块 | 功能 | 是否纳入 MVP |
|---|---|---|
| 协议剂量页 | DOM 开关 | 是 |
| 协议剂量页 | 保护器官选择 | 是 |
| 协议剂量页 | 保护强度选择 | 是 |
| 协议剂量页 | 剂量变化预估 | 简化展示 |
| 螺旋参数页 | DOM 状态摘要 | 是 |
| 扫描确认页 | DOM 状态展示 | 是 |
| 扫描确认页 | 风险确认弹窗 | 是 |
| 后端模型 | 复用 dom 字段 | 是 |
| 后端克隆 | clone DOM 到 scan session | 是 |
| 剂量日志 | 记录启用状态 | 简化 |
| 4D 支持 | DOM 联动 | 暂不纳入 |
| 真实剂量曲线 | mA 角度曲线 | 暂不纳入 |

---

### 14.2 MVP 推荐交互文案

#### DOM 卡片标题

```text
DOM 器官剂量保护
```

#### 功能说明

```text
根据当前扫描部位与患者体位，对辐射敏感器官方向进行剂量调节。启用后可能影响局部图像噪声，请结合诊断目的确认。
```

#### 扫描确认提示

```text
当前序列已启用 DOM 器官剂量保护：乳腺｜保护强度：中。
系统将降低前方敏感区域剂量，可能导致局部图像噪声升高。
```

#### 不兼容提示

```text
当前序列未开启自动 mA 调制，DOM 器官剂量保护不可用。请开启自动 mA 或关闭 DOM。
```

#### 诊断目标冲突提示

```text
当前保护器官可能位于本次诊断关注区域。启用 DOM 后可能影响相关区域图像质量，请确认是否继续。
```

---

## 15. 对 WT32 当前代码的落地建议

### 15.1 后端修改点

#### `backend/models.py`

短期不一定新增字段，先规范现有 `dom` 字段。

后续建议增加：

```python
dom_config = Column(Text, nullable=True)
```

#### `backend/schemas.py`

将 DOM 定义为更清晰的类型。

示例：

```python
DomMode = Literal["off", "auto", "breast", "eye_lens", "thyroid", "gonad", "custom"]
```

并替换：

```python
dom: Optional[str] = None
```

#### `backend/routers/scan_sessions.py`

在以下位置补齐 DOM 克隆：

- `_clone_session_from_protocol`
- `_clone_session_series`

示例：

```python
dom=series.helical_param.dom
```

---

### 15.2 前端修改点

#### `ui-review/src/screens/WT32NewProtocolDoseDetailScreen.tsx`

当前页面应从“剂量/通知阈值”升级为：

```text
剂量 / DOM / 通知阈值
```

新增 DOM 配置区域。

#### `ui-review/src/screens/WT32NewProtocolHelicalDetailScreen.tsx`

当前字段：

```text
DOM (动态扫描)
```

建议替换为：

```text
DOM 器官剂量保护
```

并从 input 改为 select / status card。

#### `ui-review/src/screens/ScanConfirmScreen.tsx`

增加：

- DOM 状态读取
- DOM 风险提示
- 扫描前确认弹窗

#### `ui-review/src/lib/scanSession.ts`

增加：

```ts
export type DomMode =
  | "off"
  | "auto"
  | "breast"
  | "eye_lens"
  | "thyroid"
  | "gonad"
  | "custom";
```

并让 `dom?: DomMode | null`。

---

## 16. 最终建议

WT32 当前最适合采用“低侵入、逐步增强”的方式实现 DOM：

第一版不要追求真实复杂剂量算法，而是先完成控制端产品闭环：

```text
协议模板可配置
→ 本次扫描可继承
→ 扫描前可确认
→ 执行时可展示
→ 扫描后可记录
```

从产品角度看，DOM 不是单纯参数，而是一个 **剂量安全策略**。  
它应该被纳入 WT-Dose 智能剂量体系，与自动 mA、CTDIvol、DLP、DRL、剂量通知、剂量日志共同设计。

推荐第一阶段目标：

> 在 WT32 中实现“DOM 器官剂量保护”的可配置、可确认、可追踪能力，但不在 UI 层实现真实曝光调制算法。
