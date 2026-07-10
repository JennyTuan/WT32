# Documentation Index

This directory holds project notes that are too detailed for the root README.

## Core References

- [CT_DOMAIN_CONTEXT.md](CT_DOMAIN_CONTEXT.md): CT terminology, safety boundaries, and copywriting constraints for implementation work.
- [database-migrations.md](database-migrations.md): PostgreSQL configuration, Alembic migration, rollback, and verification.
- [agents/](agents/): AI assistant configuration for issue tracking, triage labels, domain docs, and testing baseline.
- [常规扫描模块测试用例.md](常规扫描模块测试用例.md): Smoke, P0/P1/P2 test cases for the regular scan module, excluding gating, 4D, and DOM.
- [4D-image-viewer-plan.md](4D-image-viewer-plan.md): 4D-Lung preprocessing and `/image-viewer` data integration plan.
- [4D工程师IMG数据接入说明.md](4D工程师IMG数据接入说明.md): Engineer-provided 4D `.img` data parsing, preview generation, phase filtering, and formal frontend integration contract.
- [系统测试报告.md](系统测试报告.md): System test notes.

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
