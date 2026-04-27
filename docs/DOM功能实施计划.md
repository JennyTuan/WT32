# DOM 功能实施计划

> 更新时间：2026-04-27

## 总览

- [x] 阶段 0：DOM 枚举规范化
- [x] 阶段 1：独立 DOM 配置数据模型（含 `scan_session_dom_configs`）
- [x] 阶段 2：协议详情页 DOM 配置界面（四分区）
- [x] 阶段 3：扫描确认页 DOM 二次确认

---

## 阶段 3 完成情况（已完成）

### 任务清单

- [x] `ScanConfirmScreen.tsx`：新增 DOM 状态卡片（参数面板内，仅 `tomographicScan` / `helicalScan` 显示）
- [x] `ScanConfirmScreen.tsx`：新增 DOM 常量映射（器官/方向/强度/剂量变化）
- [x] `ScanConfirmScreen.tsx`：加载会话 DOM 配置（`fetchScanSessionDomConfig`）
- [x] `ScanConfirmScreen.tsx`：新增高风险弹窗 `DomRiskConfirmModal`
  - [x] 风险检测：保护器官=诊断目标（关键字匹配）
  - [x] 风险检测：DOM 开启但 `auto_ma_linked = false`
  - [x] 用户确认后记录 `user_confirmed = true`
- [x] `ScanConfirmScreen.tsx`：`PatientConfirmationModal` 扩展 `domData` 并展示 DOM 信息卡片
- [x] `HelicalScanConfirmScreen.tsx`：侧边栏新增简化 DOM 状态行（图标 + 器官 + 强度）
- [x] `HelicalScanConfirmScreen.tsx`：`PatientConfirmationModal` 传入 `domData`
- [x] 验证：`npx tsc --noEmit` 通过
- [ ] 验证：`npx vite build`（受现有 `ImageLoadScreen.tsx` 无法解析 `../lib/fourDDicomSource` 影响，仍未通过）

### 备注

`SequenceScanConfirmScreen` 通过 `<ScanConfirmScreen parameterPanelMode="tomographicScan" />` 复用能力，已自动具备阶段 3 的 DOM 卡片与风险确认流程。
