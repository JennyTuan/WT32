# 剂量设置页重构计划：DRL 重命名 + 通知阈值机制简化

> 创建时间：2026-05-24  
> 状态：实施中  
> 上下文：基于贵司《扫描参数设置.xlsx》协议库的实际数据，发现先前实现与公司临床实践不一致，需要纠正。

---

## 1. 背景与触发原因

在剂量设置页（`/service/dose/settings`）第一版实现中，我（基于通用知识）做了两个**错误假设**：

| 错误假设 | 实际情况（来自公司协议表） |
|---|---|
| 系统级 DRL 是阈值概念 | 系统级表实际存的是**协议预计剂量值默认值**，被协议页"一键应用"按钮使用 |
| 通知阈值 = DRL × 全局倍率 | 通知阈值是**协议级硬编码绝对值**，每个协议自己一组（col V/W），与系统 DRL 无关 |

证据来源：[`C:\Users\stn0047\Downloads\扫描参数设置.xlsx`](file:///C:/Users/stn0047/Downloads/扫描参数设置.xlsx)

表里的 Brain 协议（成人头颅）展示了两套数值的并列：
- CTDIvol 59.4 mGy / DLP 1168.5 mGy·cm —— **协议预计剂量**（col S/U）
- 剂量通知 CTDIvol 80 / 剂量通知 DLP 1320 —— **通知阈值**（col V/W）

两者**独立配置**，阈值不是用倍率算出来的。

## 2. 本次变更范围

### 2.1 UI 改动（轻）

**重命名**：剂量设置页的第①节，从：
- 标题 `"DRL 诊断参考值"`
- 副标题 `"系统级 CTDIvol / DLP 参考值，协议页可一键应用，超阈值时基于此触发提醒"`

改为：
- 标题 `"协议剂量参考默认值"`
- 副标题 `"按部位 × 人群预设的代表性剂量值，新建协议时可一键应用作为起点"`

去掉"超阈值时基于此触发提醒"这句（不正确）。

### 2.2 通知阈值机制重构（重）

**第②节** 当前结构：
```
[仅记录][弹窗警告][强制二次确认]   ← threshold_action 三选一
CTDI 默认倍率 [1.35]
DLP 默认倍率 [1.13]
```

改为：
```
[仅记录][弹窗警告][强制二次确认]   ← threshold_action 三选一（保留）
hint: 协议级通知阈值在各协议详情页配置；本处仅定义超阈值后的全局响应方式
```

去掉两个倍率字段。

### 2.3 数据层改动

**前端** `ui-review/src/lib/doseSettingsApi.ts`：
- 删除 `threshold_ctdi_multiplier: number` 字段
- 删除 `threshold_dlp_multiplier: number` 字段

**后端** `backend/models.py`：
- 删除 `threshold_ctdi_multiplier = Column(Float, ...)`
- 删除 `threshold_dlp_multiplier = Column(Float, ...)`

**后端** `backend/schemas.py`：
- `DoseSettingsBase` 删两个倍率字段
- `DoseSettingsUpdate` 删两个倍率字段

**API 路径不变**：`/api/dose-settings/`、`/api/dose-settings/drl` 全部保留（避免 breaking change）。仅响应字段精简。

## 3. 不在本次范围内（明确边界）

| 项 | 状态 | 说明 |
|---|---|---|
| 协议级阈值在协议详情页的实现 | 未做 | 协议详情页 [Panels.tsx](../ui-review/src/features/protocolDetail/components/Panels.tsx) 已有 UI 占位（"通知阈值（可编辑）"），需要确认 Protocol model 是否已有 ctdi_alert / dlp_alert 字段，后续单独立项 |
| "一键应用系统 DRL" 按钮的实际跳线 | 未做 | 当前是纯展示按钮，后续单独立项把它接到 DRL API |
| 实际触发告警的扫描后逻辑 | 未做 | 取决于 ScanLog 在写入时如何比对协议阈值 |
| 协议库批量导入 Excel | 未做 | 是大工程，另外立项 |

## 4. 实施步骤（任务清单）

1. **写本文档**（你正在读的这份）
2. **重命名 UI**：改 [ServiceDoseSettingsPage.tsx](../ui-review/src/features/service/dose/ServiceDoseSettingsPage.tsx) 第①节文案
3. **前端去倍率**：
   - 改 ServiceDoseSettingsPage.tsx 第②节，删两个 LabeledNumber + 把 hint 改成"协议级阈值在协议详情页配置"
   - 改 doseSettingsApi.ts 类型定义
4. **后端去倍率**：
   - 改 backend/models.py、schemas.py
5. **验证**：
   - `npx tsc -b` 通过
   - `npm run build` 通过
   - `python -c "from backend import main"` 通过

## 5. 风险与回滚

### 5.1 风险

| 风险 | 评估 | 缓解 |
|---|---|---|
| 已有 DB 表的两列残留 | 低 | SQLite 不支持 ALTER DROP COLUMN，但模型不 map 后无副作用；不强行处理 |
| 路由 `/api/dose-settings/` 调用方依赖被删字段 | 低 | grep 全代码仓只有剂量设置页一处使用，已同步更新 |
| 旧 DB 中 threshold_ctdi_multiplier/dlp_multiplier 仍是 1.35/1.13 | 低 | 字段在新版 Schema 不存在，pydantic 自动忽略 |

### 5.2 回滚预案

如需回滚到带倍率的版本：
```bash
git revert <commit-hash>
```
DB 字段还在，恢复 model + schema 即可。无破坏性数据变更。

## 6. 上下文索引（便于接力）

| 文件 | 角色 |
|---|---|
| `ui-review/src/features/service/dose/ServiceDoseSettingsPage.tsx` | 剂量设置页主体 |
| `ui-review/src/lib/doseSettingsApi.ts` | 前端 API 类型 |
| `backend/models.py` `DoseSettings`, `DrlEntry` | 数据库模型 |
| `backend/schemas.py` `DoseSettingsBase`, `DoseSettingsUpdate`, `DrlEntry` | Pydantic schema |
| `backend/routers/dose_settings.py` | API 路由 |
| `backend/database.py` `DRL_SEEDS`, `_seed_dose_defaults` | 出厂种子数据 + 种子函数 |
| `ui-review/src/features/protocolDetail/components/Panels.tsx:273` | "一键应用系统 DRL" 按钮所在位置 |

## 7. 后续待办（不在本次）

1. 把"一键应用系统 DRL" 按钮接到 `GET /api/dose-settings/drl` 并自动填充协议参考剂量
2. 检查 Protocol model 是否需要添加 `ctdi_alert_threshold` / `dlp_alert_threshold` 字段
3. 扫描完成后比对实测剂量 vs 协议阈值，触发对应 threshold_action
4. 协议库批量从 Excel 导入（含 ReconSeries 一对多）

## 8. 关键背景知识：协议表的列定义

来自 [扫描参数设置.xlsx](file:///C:/Users/stn0047/Downloads/扫描参数设置.xlsx) EN sheet：

| 列 | 含义 |
|---|---|
| S `CTDIvol (mGy)` | 协议预计 CTDIvol（标准模体上计算）|
| T `CTDI phantom size (cm)` | CTDI 模体尺寸（16 头部 / 32 体部）|
| U `DLP (mGy*cm)` | 协议预计 DLP |
| V `Dose report CTDIvol value` | 通知阈值 CTDIvol（绝对值）|
| W `Dose report DLP value` | 通知阈值 DLP（绝对值）|

S/U → 系统级"协议剂量参考默认值"（出厂种子）  
V/W → 协议级"通知阈值"（每个协议自己一组）

**多重建配方**：表里同一协议（如 Brain）会出现多行，扫描参数与剂量完全相同，只是 Filter（重建核）+ WindowWidth/WindowCenter 不同。对应数据模型中的 `Protocol → Series → ReconSeries`（一对多）。
