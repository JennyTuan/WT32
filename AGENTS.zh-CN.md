# AGENTS.zh-CN.md - WT32 协作指南

本文档是供 AI 编码助手在本仓库工作时使用的轻量入口文件。

## 优先阅读

- 项目概览、环境搭建、架构、路由：[README.md](README.md)
- 文档地图：[docs/README.md](docs/README.md)
- CT 术语、安全表述和领域约束：[docs/CT_DOMAIN_CONTEXT.md](docs/CT_DOMAIN_CONTEXT.md)

## 项目边界

WT32 是用于产品和 UI 验证的 CT 扫描控制台原型，不是临床软件。

不要生成会暗示以下含义的文案或行为：

- 真实设备控制
- 诊断结论
- 治疗建议
- 安全保证
- 最终剂量计算或剂量批准

对于扫描参数、剂量、对比剂和安全相关 UI 文案，应使用“预计”“参考”“模拟”“需确认”等措辞。

## 生成文件和大体积文件

默认不要读取以下内容：

- `.venv/`、`ui-review/node_modules/`、`ui-review/dist/`
- `.codex-run-logs/`、`test-results/`、构建日志和临时检查文件
- `backend/data/**`、`ui-review/public/dicom/`、`ui-review/public/dicom-4d/`、`ui-review/public/fourd-engineer/` 下的原始或生成医学影像数据
- DICOM/MHA/WebP 图像栈，例如 `*.dcm`、`*.dicom`、`*.mha` 和生成的切片资源
- 大型二进制文档，例如 `*.docx`、`*.xlsx` 和压缩包

只有在任务明确涉及图像加载、DICOM 导入、演示数据或构建产物对比时，才打开这些文件。

## 本地开发

后端：

```powershell
cd C:\STN\projects\WT32
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

前端：

```powershell
cd C:\STN\projects\WT32\ui-review
npm.cmd run dev
```

如果 PowerShell 阻止 `npm.ps1`，请在 Windows 上使用 `npm.cmd`。

## 本地原型登录

后续 AI 助手在本地 WT32 原型 UI 中需要登录时，使用以下测试账号：

- 用户名：`U0001`
- 密码：`stn123456`

该账号仅用于本地开发和 UI 验证。

## 代码导航

后端阅读顺序：

1. `backend/models.py`
2. `backend/schemas.py`
3. `backend/routers/*.py`
4. `backend/websocket/scan_ws.py`

前端阅读顺序：

1. `ui-review/src/App.tsx`
2. `ui-review/src/lib/scanWorkflowSession.ts`
3. `ui-review/src/lib/scanSession.ts`
4. `ui-review/src/screens/`
5. `ui-review/src/features/`

## 实现约定

- 遵循现有 React + TypeScript + Tailwind 模式。
- 保持 1024 x 768 控制台布局稳定且适合触控。
- 保持协议模板与扫描会话的分离。
- 除非工作流明确保存为模板，否则会话编辑不得修改协议模板。
- 长篇说明放入 `docs/`；不要新增根目录规划文件。
- 不要提交 `.venv/`、`node_modules/`、构建日志、运行日志或外部原始 DICOM 数据。

## 测试和质量门禁

- 当前测试基线和推荐测试增长优先级见 [docs/agents/testing.md](docs/agents/testing.md)。
- 行为测试是实现的一部分，不是可选清理项。
- 优先通过公共接口和用户可见工作流行为进行测试，而不是测试私有实现细节。
- 后端变更运行：

```powershell
cd C:\STN\projects\WT32
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests
```

- 前端变更先运行相关 focused 检查，然后至少运行：

```powershell
cd C:\STN\projects\WT32\ui-review
npm.cmd run lint
npm.cmd run build
```

- 当前前端尚无专用测试运行器。新增时，应在此处记录命令，并保证可通过 Windows 上的 `npm.cmd` 运行。
- 不要让新的 lint 或 build warning 变成背景噪声；要么修复，要么说明为什么接受。

## 代码注释

- 对非显而易见的业务规则、CT 领域约束、安全措辞、状态流转和协议/会话复制边界添加注释。
- 注释保持简洁有用，避免复述下一行代码已经表达的内容。
- 新增代码注释使用简体中文。

## Token 预算说明

- 从本文件开始，然后阅读 `README.md`，再只阅读相关后端 router、前端 screen 或领域文档。
- 前端工作流变更优先查看 `ui-review/src/App.tsx`、`ui-review/src/screens/` 和 `ui-review/src/lib/` 中的相关 helper。
- 后端 API 变更优先查看 `backend/main.py`、`backend/models.py`、`backend/schemas.py` 和具体的 `backend/routers/*.py` 模块。
- 涉及 CT 术语或安全敏感文案时，编辑前阅读 `docs/CT_DOMAIN_CONTEXT.md`。

## Agent 技能

### Issue tracker

Issue 和 PRD 记录在 `JennyTuan/WT32` 的 GitHub Issues 中。见 [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)。

### Triage 标签

使用默认五类 triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human` 和 `wontfix`。见 [docs/agents/triage-labels.md](docs/agents/triage-labels.md)。

### 领域文档

本仓库是单上下文仓库。涉及领域敏感工作前，阅读 `docs/CT_DOMAIN_CONTEXT.md`、`docs/README.md` 和相关 docs/ADR。见 [docs/agents/domain.md](docs/agents/domain.md)。
