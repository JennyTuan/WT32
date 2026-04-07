# WT32 项目代码库梳理（结构 + 业务流程）

## 1. 项目定位

WT32 是一个 **CT 扫描工作站原型系统**，目标是模拟真实 CT 操作台的核心流程（患者管理、协议配置、扫描执行、图像浏览与设备维护），用于产品/UI 验证而非临床诊疗。

系统采用前后端分离：

- **后端**：FastAPI + SQLAlchemy + SQLite
- **前端**：React + TypeScript + Vite + Tailwind

---

## 2. 总体架构

```text
ui-review (React)
   ├─ 页面路由与交互
   ├─ localStorage 会话状态
   ├─ Dexie(IndexedDB) 协议快照缓存
   └─ fetch /ws 调用
          │
          ▼
backend (FastAPI)
   ├─ REST API（患者 / 协议 / 扫描参数 / 扫描会话）
   ├─ WebSocket（模拟扫描事件）
   ├─ SQLAlchemy ORM
   └─ SQLite(app.db) + 启动时种子数据
```

关键点：后端同时维护“**协议模板**”与“**扫描会话实例**”。扫描会话在创建时会从协议模板深拷贝，后续在会话中修改参数不会反向污染模板。

---

## 3. 项目结构（按目录）

## 根目录

- `README.md`：项目目标、启动方式、路由与流程说明。
- `backend/`：后端服务。
- `ui-review/`：前端应用（平板 UI 壳 + 多页面流程）。

## backend/

- `main.py`：FastAPI 入口、CORS、路由注册、启动初始化数据库。
- `database.py`：数据库引擎、Session、Base、协议种子数据和 `init_db`。
- `models.py`：ORM 模型定义，包含模板域与会话域两套结构。
- `schemas.py`：Pydantic 入参/出参模型。
- `routers/`
  - `patients.py`：患者 CRUD + 按 patient_code 查询。
  - `protocols.py`：协议与序列、4D 配置、呼吸训练参数。
  - `scan_params.py` / `recon_params.py` / `contrast_configs.py`：参数级别的 CRUD。
  - `scan_sessions.py`：扫描会话生命周期与会话内序列/参数编辑。
- `websocket/scan_ws.py`：扫描控制模拟信道，按 command 返回事件流。

## ui-review/

- `src/App.tsx`：统一路由入口 + 平板外壳缩放策略。
- `src/screens/`：业务页面（患者、协议、扫描、服务页等）。
- `src/lib/`
  - `scanSession.ts`：与后端扫描会话 API 交互 + localStorage 缓存。
  - `patientSession.ts`：患者上下文存储。
  - `scanWorkflowSession.ts`：跨页面工作流计划持久化。
  - `protocolDb.ts`：Dexie 协议快照导入与查询。
- `public/dicom/`：DICOM 样例数据。

---

## 4. 后端数据模型（核心业务对象）

可分为两层：

1. **模板层（Protocol Domain）**
   - `Protocol`
   - `Series`
   - `TopogramParam` / `HelicalParam` / `AxialParam`
   - `ReconSeries`
   - `ContrastConfig`
   - `FourDConfig` + `BreathingTrainingParam`

2. **执行层（Scan Session Domain）**
   - `ScanSession`
   - `ScanSessionSeries`
   - `ScanSessionTopogramParam` / `ScanSessionHelicalParam` / `ScanSessionAxialParam`
   - `ScanSessionReconSeries`
   - `ScanSessionContrastConfig`
   - `ScanSessionFourDConfig` + `ScanSessionBreathingTrainingParam`

这样设计的业务价值：

- 协议可以持续维护为“标准模板”；
- 每次检查生成独立会话快照；
- 会话中调参支持个体化，不影响模板。

---

## 5. 核心业务流程（从代码视角）

## 流程 A：患者准备

1. 前端患者页选择/新建患者（当前页面含演示数据）。
2. `scanSession.ts` 在发起扫描会话前，会先通过 `/api/patients/lookup/{patient_code}` 尝试映射后端患者；不存在则调用 `/api/patients/` 自动创建。

## 流程 B：选择协议并创建扫描会话

1. 前端协议页读取协议目录或详情。
2. 调用 `POST /api/scan-sessions/`。
3. 后端 `scan_sessions.py` 执行 `_clone_session_from_protocol`：
   - 复制协议基础字段到 `ScanSession`；
   - 深拷贝对比剂、序列、扫描参数、重建参数、4D 参数。

## 流程 C：会话内参数编辑

1. 前端在协议编辑/确认页面改参数。
2. 通过会话级接口更新（如 `/api/scan-sessions/helical/{id}`、`/recon-series/{id}` 等）。
3. 可对会话序列做新增、复制、删除，并自动重排 `series_order`。

## 流程 D：扫描执行与状态推进

1. 启动会话：`POST /api/scan-sessions/{id}/start`，状态置为 `in_progress`。
2. 完成会话：`.../complete`，写入 started/completed 时间。
3. 取消会话：`.../cancel`。
4. 扫描执行页通过 `ws://.../ws/scan-control` 与模拟设备交互：`START_SCAN`、`PAUSE_SCAN`、`STOP_SCAN`。

## 流程 E：图像查看与服务功能

- 前端提供 DICOM 浏览页面和设备维护页面（球管预热/空气校准/日检等），用于流程串联与界面验证。

---

## 6. 前端交互与状态管理特点

- **路由中心化**：`App.tsx` 将所有页面挂在同一 Router，下发到 1024x768 的“平板窗口”。
- **本地会话状态**：通过 localStorage 保留“当前患者/会话/流程计划”，页面跳转后仍可恢复上下文。
- **本地协议库**：`protocolDb.ts` 使用 Dexie 导入业务快照并持久化，支持离线或低耦合展示。
- **真实 API + 演示 UI 共存**：部分页面（如患者列表）仍以内置 mock 数据驱动 UI，但扫描会话链路已对接后端 API。

---

## 7. 你接手时建议优先阅读顺序

1. `README.md`（全局定位）
2. `backend/models.py`（数据结构全貌）
3. `backend/routers/scan_sessions.py`（核心业务编排）
4. `ui-review/src/lib/scanSession.ts`（前后端连接点）
5. `ui-review/src/screens/ProtocolSetupScreen.tsx`（协议到会话的 UI 实现）
6. `backend/websocket/scan_ws.py`（扫描事件模拟）

---

## 8. 当前实现特征与注意事项

- WebSocket 为模拟事件，不代表真实设备协议。
- 协议种子数据体量大，启动即初始化，适合演示和快速回归。
- 扫描会话域已较完整，适合扩展“检查单管理、审计日志、任务队列”等能力。
- 前端部分页面偏原型风格，存在与后端数据源混用的情况，后续可逐步统一。
