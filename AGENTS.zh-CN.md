# WT32 智能体协作指南

## 范围与安全边界

WT32 是用于产品和 UI 验证的 CT 扫描控制台原型，不是临床软件。不得暗示真实设备控制、诊断结论、治疗建议、安全保证、最终剂量计算或剂量批准。

扫描参数、剂量、对比剂和安全相关 UI 文案应使用“预计”“参考”“模拟”“需确认”等措辞。

## 高效工作

- 修改前先检查当前行为和与任务直接相关的文件；保留工作区内无关的未提交改动。
- 架构或环境相关时阅读 [README.md](README.md)；仅在需要文档或产品背景时阅读 [docs/README.md](docs/README.md)。
- 涉及 CT 术语、剂量、对比剂、安全或临床工作流前，阅读 [docs/CT_DOMAIN_CONTEXT.md](docs/CT_DOMAIN_CONTEXT.md)。
- 除非任务直接涉及，否则不打开大体积或生成内容：`.venv/`、`ui-review/node_modules/`、`ui-review/dist/`、日志/测试结果、`backend/data/**`、DICOM/影像堆栈或大型二进制文档。

## 实现前验证

对于新需求、模糊需求或安全敏感需求：

- 区分观察到的问题与提出的解决方案；先检查既有工作流意图和产品边界。
- 不要因为 UI 看起来不完整或某个值为 `--` 就新增行为。
- 简要说明：是否修改、修改范围、不在范围内的内容，以及验证方式。
- 当领域事实不确定时，编码前使用适当的调研或需求分析流程。

## 定位修改范围

- 后端：`backend/models.py` → `backend/schemas.py` → 相关 `backend/routers/*.py` → `backend/websocket/scan_ws.py`。
- 前端：`ui-review/src/App.tsx` → `ui-review/src/lib/scanWorkflowSession.ts` / `scanSession.ts` → 相关 `screens/` 和 `features/`。

## 实现规则

- 遵循现有 React、TypeScript、Tailwind 和 Python 模式。
- 保持 1024 × 768 控制台布局适合触控操作。
- 保持协议模板与扫描会话分离：除非工作流明确保存模板，否则会话编辑不得修改模板。
- 长篇文档放入 `docs/`；不要在根目录新增规划文档。
- 不提交虚拟环境、依赖目录、日志、构建产物或外部原始 DICOM 数据。
- 仅为不明显的领域规则、安全措辞、状态转换或模板/会话复制边界添加简洁的简体中文注释。

## 运行与验证

后端开发：

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000
```

前端开发（Windows 使用 `npm.cmd`）：

```powershell
cd ui-review
npm.cmd run dev
```

- 后端变更后，在仓库根目录运行 `.\.venv\Scripts\python.exe -m unittest discover -s backend\tests`。
- 前端变更后，先运行相关聚焦检查，再在 `ui-review` 中运行 `npm.cmd run lint` 和 `npm.cmd run build`。
- 优先覆盖用户可见或公共接口的行为；不得遗留未说明的新 lint 或构建警告。

## 本地 UI 验证

登录需要时，使用仅限本地的测试账号：`U0001` / `stn123456`。

## 按任务查阅的参考资料

- 测试基线和测试增长优先级：[docs/agents/testing.md](docs/agents/testing.md)
- GitHub Issue/PRD 工作流：[docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
- 领域文档和 ADR 指引：[docs/agents/domain.md](docs/agents/domain.md)
