# Documentation Index

This directory holds project notes that are too detailed for the root README.

## Core References

- [CT_DOMAIN_CONTEXT.md](CT_DOMAIN_CONTEXT.md): CT terminology, safety boundaries, and copywriting constraints for implementation work.
- [database-migrations.md](database-migrations.md): PostgreSQL configuration, Alembic migration, rollback, and verification.
- [agents/](agents/): AI assistant configuration for issue tracking, triage labels, domain docs, and testing baseline.
- [archive/](archive/): 带日期的历史分析与计划快照；归档内容不自动代表当前产品基线。
- [常规扫描模块测试用例.md](常规扫描模块测试用例.md): Smoke, P0/P1/P2 test cases for the regular scan module, excluding gating, 4D, and DOM.
- [图像浏览模块功能说明.md](图像浏览模块功能说明.md): 图像浏览的 2D/3D 模式、工具适用矩阵、平板触屏交互、切换与复位规则。
- [4D-image-viewer-plan.md](4D-image-viewer-plan.md): 4D-Lung preprocessing and `/image-viewer` data integration plan.
- [4D工程师IMG数据接入说明.md](4D工程师IMG数据接入说明.md): Engineer-provided 4D `.img` data parsing, preview generation, phase filtering, and formal frontend integration contract.
- [reconstruction-service-integration.md](reconstruction-service-integration.md): 离线重建任务服务、Provider 接口、新序列接入、错误码与后续扩展说明。
- [device-error-ui-production-implementation-guide.md](device-error-ui-production-implementation-guide.md): 设备错误与状态反馈 UI 的生产实现规则、事件契约、验收矩阵和 Codex 交接方式。
- [模拟物理按键交接讨论稿.md](模拟物理按键交接讨论稿.md): 模拟物理按键的扫描流程、提示层关闭规则与异常处理。
- [系统测试报告.md](系统测试报告.md): System test notes.

## Active Working Documents

- [working/phase-0/](working/phase-0/): 阶段 0 的实施证据，包括五条黄金流程、状态源矩阵和异地 / 真机环境问题反馈模板；D0 决策已转入正式产品基线，其他观察内容仍不自动代表已批准要求。
- [working/phase-1/](working/phase-1/): 阶段 1 的实时实施状态、逐项证据与验收门槛；用于区分“已实现”“待验证”和“进行中”，不替代已批准产品基线。
- [working/requirements/WT32_PRODUCT_REQUIREMENTS_INVENTORY.md](working/requirements/WT32_PRODUCT_REQUIREMENTS_INVENTORY.md): 候选需求、冲突项与待确认事项清单；仅用于讨论和追踪。

## Approved Product Baselines

- [baseline/](baseline/): 已明确批准的产品边界、目标工作流和验收约束；D0-001 至 D0-009 的阶段 0 结论自 2026-07-16 起生效。

## DOM / Dose Work

- [协议管理与剂量设置逻辑梳理PRD.md](协议管理与剂量设置逻辑梳理PRD.md): Protocol management, scan-session, dose settings, and DOM logic PRD.
- [WT32_DOM_Research_Report.md](WT32_DOM_Research_Report.md): DOM feature research and product recommendations.
- [剂量日志页面修改计划.md](剂量日志页面修改计划.md): Dose log page change plan.
- `DOM_Phase1_ZAxis_mA_Modulation_Implementation.docx`: DOM phase 1 implementation document.
- `DOM_一期功能说明与现有项目实现方案.docx`: DOM phase 1 functional description and implementation plan.

## Documentation Rules

- Keep the root README focused on setup, architecture, and navigation.
- Put long plans, research, test reports, and handoff notes here.
- Do not commit transient build output such as `build-log.txt`, `scan_results.txt`, or compiler captures.
