# CT-Prototype

> **AI 协作说明**：本文档专为 AI 助手（Claude、ChatGPT 等）撰写，旨在让任何 AI 无需额外问答即可快速理解项目并展开工作。

---

## 项目概述

这是一款 **CT 扫描仪控制与管理系统**原型，模拟真实 CT 机的操作界面，涵盖：

- 患者管理（登记、查询、新增）
- 扫描协议管理（100+ 预置协议，支持头部/颈部/胸部/脊柱/腹部/盆腔/四肢等）
- 完整扫描工作流（定位像 → 螺旋扫描 → 图像重建）
- **4D 呼吸门控扫描**（诊断确认 → 断层采集 → 时相回顾 → 重扫选择）
- DICOM 图像查看（基于 Cornerstone3D，支持 Stack 与 MPR 视图）
- 设备服务功能（球管预热、空气校准、日检、硬件测试、电池/磁盘管理、性能评估、QA 报告、角点信息等）
- 前端以 1024×768 平板外壳模拟设备屏幕，根据窗口自动缩放

**目标用户**：产品经理主导，用于研发和内部需求快速验证，非临床使用。

---

## 技术栈

| 层级 | 技术 |

|------|------|
| 后端框架 | FastAPI 0.115.12 |
| 后端服务器 | Uvicorn 0.34.0 |
| 数据库 | SQLite + SQLAlchemy 2.0.39 |
| 数据校验 | Pydantic 2.11.2 |
| 前端框架 | React 19.2.0 + TypeScript 5.9.3 |
| 前端路由 | React Router DOM 7.13.2 |
| 构建工具 | Vite 7.3.1 |
| 样式 | Tailwind CSS 3.4.17 |
| 图标 | Lucide React 0.575 |
| 本地数据库 | Dexie 4.3.0（IndexedDB） |
| DICOM 解析/渲染 | Cornerstone3D 4.20（`@cornerstonejs/core`、`tools`、`dicom-image-loader`）+ dicom-parser 1.8.21 |
| 拖拽交互 | @dnd-kit/core、sortable、utilities |
| 截图导出 | html2canvas 1.4.1 |

---

## 目录结构

```
CT-Prototype/
├── backend/                    # Python FastAPI 后端
│   ├── main.py                 # 应用入口、CORS、路由注册
│   ├── models.py               # SQLAlchemy ORM 模型（含 acquisition_type 4D 字段）
│   ├── schemas.py              # Pydantic Schema
│   ├── database.py             # 数据库初始化 + 协议种子数据
│   ├── reset_db.py             # 重置数据库工具
│   ├── query_db.py             # 数据库查询调试脚本
│   ├── requirements.txt        # Python 依赖
│   ├── app.db                  # SQLite 数据库
│   ├── data/                   # 数据/资源目录
│   ├── routers/
│   │   ├── patients.py         # 患者 CRUD
│   │   ├── protocols.py        # 协议与序列管理
│   │   ├── scan_params.py      # 定位像/螺旋/轴扫参数
│   │   ├── recon_params.py     # 重建序列参数
│   │   ├── contrast_configs.py # 对比剂配置
│   │   ├── scan_sessions.py    # 扫描会话（工作流状态）
│   │   ├── corners.py          # 角点信息（服务模式）
│   │   └── disk_manager.py     # 磁盘管理（服务模式）
│   └── websocket/
│       └── scan_ws.py          # 模拟扫描控制 WebSocket
│
├── ui-review/                  # React TypeScript 前端
│   ├── .env                    # VITE_API_BASE_URL=http://localhost:8000
│   ├── vite.config.ts
│   ├── package.json
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx             # 路由定义 + 平板外壳缩放
│       ├── main.tsx
│       ├── screens/            # 主页面（见下方路由表）
│       ├── features/           # 按功能聚合的复杂页面模块
│       │   ├── protocolDetail/ # 协议详情编辑（拆分为组件、hooks、types）
│       │   └── service/        # 服务模式各子模块
│       │       ├── airCalibration/ batteryManagement/ cornerInfo/
│       │       ├── dailyQa/ diskManagement/ hardwareTest/
│       │       ├── performanceEvaluation/ protocolManagement/
│       │       ├── qaReport/ tubeWarmup/ shared/
│       ├── components/
│       │   ├── DicomViewer.tsx
│       │   ├── CornerstoneStackViewport.tsx # Cornerstone Stack 视图
│       │   ├── CornerstoneMPRViewport.tsx   # Cornerstone MPR 视图
│       │   ├── ProtocolEditorModal.tsx
│       │   └── serviceMode/                 # 服务模式通用组件
│       └── lib/
│           ├── protocolDb.ts            # Dexie IndexedDB 协议库
│           ├── patientSession.ts        # 当前患者上下文
│           ├── scanSession.ts           # 扫描会话状态
│           ├── scanWorkflowSession.ts   # 扫描工作流状态机
│           ├── scoutPositioningSession.ts # 定位像状态
│           ├── fourDTypes.ts            # 4D 相关类型定义
│           ├── cornerConfig.ts          # 角点配置
│           └── cornerstone/
│               └── initCornerstone.ts   # Cornerstone3D 初始化
│
├── docs/
│   └── PROJECT_ANALYSIS.md
├── 4D_CT_扫描流程与后处理_技术文档.docx
└── .claude/
    └── launch.json
```

---

## 本地开发启动

### 前置要求

- Python 3.13+
- Node.js 18+
- `pip install -r backend/requirements.txt`

### 启动后端

```bash
cd C:\CT-Prototype-backup\CT-Prototype
uvicorn backend.main:app --reload --port 8000
```

### 启动前端

```bash
cd C:\CT-Prototype-backup\CT-Prototype\ui-review
npm run dev
```

### 一键同时启动前后端

```bash
cd ui-review
npm run dev:all   # 通过 concurrently 同时启动 uvicorn + vite
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端页面 | <http://localhost:5175> |
| 后端 API | <http://localhost:8000> |
| API 文档 | <http://localhost:8000/docs> |

### ⚠️ 已知问题：CORS 端口

`backend/main.py` 的 CORS 白名单默认只包含 `localhost:3000` 和 `localhost:5173`，
若 Vite 启动到 `5175` 等端口，需在 `allow_origins` 中追加，避免跨域被拦。

---

## 数据库结构

### 核心表关系

```
protocols
  └── series (一对多)
        ├── topogram_params (一对一，定位像参数)
        ├── helical_params  (一对一，螺旋参数)
        ├── axial_params    (一对一，轴扫参数)
        ├── recon_series    (一对多，重建序列)
        └── fourd_configs   (一对一，4D 配置)
              └── breathing_training_params (一对一)
  └── contrast_configs (一对一，对比剂配置)

patients          (独立表)
scan_sessions     (扫描会话，记录工作流状态)
```

### 4D 扫描关键字段

- `series.acquisition_type` / `fourd_configs.acquisition_type`：`regular` | `4d`，用于在扫描流程中判断是否走 4D 门控分支（代替旧的字符串名匹配）。

### 主要字段

**patients**: `name`, `patient_id`, `gender`, `birth_date`, `height`, `weight`

**protocols**: `name`, `body_part`（HEAD/NECK/CHEST/SPINE/ABDOMEN/PELVIS/EXTREMITY）, `age_group`（adult/child/infant）, `scan_mode`（plain/contrast/4d）, `position`（head_first/feet_first）

**series**: `series_type`（topogram/helical/axial/4d）, `series_order`, `acquisition_type`

**helical_params**: `kv`, `auto_ma`, `min_ma`/`max_ma`, `pitch`, `rotation_time`, `scan_length`, `fov`, `slice_thickness`

**recon_series**: `kernel`（Brain2/Lung2/Bone2/S2/S3）, `matrix`, `window_level`, `window_width`, `slice_thickness`, `slice_interval`

---

## API 端点一览

**Base URL: `http://localhost:8000`**

```
GET    /                                  # 健康检查

# 患者
GET    /api/patients/                     # 列表
POST   /api/patients/                     # 新建
GET    /api/patients/{id}                 # 详情
PUT    /api/patients/{id}                 # 更新
DELETE /api/patients/{id}                 # 删除

# 协议与序列
GET/POST/PUT/DELETE  /api/protocols/series/[{id}]

# 扫描参数
GET/POST/PUT  /api/scan-params/topogram/[{id}]
GET/POST/PUT  /api/scan-params/helical/[{id}]
GET/POST/PUT  /api/scan-params/axial/[{id}]

# 重建与对比剂
GET/POST/PUT/DELETE  /api/recon-series/[{id}]
GET/POST/PUT/DELETE  /api/contrast-configs/[{id}]

# 扫描会话（工作流状态持久化）
GET/POST/PUT  /api/scan-sessions/[{id}]

# 服务模式
GET/POST/PUT  /api/corners/          # 角点信息
GET/POST      /api/disk-manager/     # 磁盘管理

# WebSocket（模拟扫描事件流）
WS  /ws/scan-control
```

**WebSocket 事件类型：** `SCAN_STATUS`、`INJECTOR_STATUS`、`BREATHING_WAVE`、`SCAN_PROGRESS`、`IMAGE_READY`

---

## 前端路由表

| 路由 | 组件 | 说明 |
|------|------|------|
| `/` | HomeScreen | 主页入口 |
| `/patients` | PatientListScreen | 患者列表，搜索/新增/删除 |
| `/protocol-select` | ProtocolSetupScreen | 协议库选择 |
| `/protocol-detail` | WT32ProtocolDetailScreen | 协议主编辑界面 |
| `/protocol-detail/scout` | WT32NewProtocolScoutDetailScreen | 定位像参数编辑 |
| `/protocol-detail/helical` | WT32NewProtocolHelicalDetailScreen | 螺旋参数编辑 |
| `/protocol-detail/recon` | WT32NewProtocolReconDetailScreen | 重建参数编辑 |
| `/protocol-detail/dose` | WT32NewProtocolDoseDetailScreen | 剂量通知 |
| `/scout-scan` | ScoutScanScreen | 激光定位 |
| `/scan-confirm` | ScanConfirmScreen | 扫描参数确认 |
| `/scout-execute` | ScoutExecuteScanScreen | 定位像执行（WebSocket） |
| `/sequence-confirm` | SequenceScanConfirmScreen | 序列参数确认 |
| `/helical-confirm` | HelicalScanConfirmScreen | 螺旋参数确认 |
| `/helical-execute` | HelicalExecuteScanScreen | 螺旋扫描执行 |
| `/fourd-confirm` | FourDDiagnosticConfirmScreen | 4D 诊断扫描确认 |
| `/fourd-phase-review` | FourDPhaseReviewScreen | 4D 时相回顾（含 FourDPhaseReviewModal） |
| `/fourd-rescan-select` | FourDRescanSelectScreen | 4D 重扫选择（呼吸波形编辑、峰谷拖拽、剂量区标识） |
| `/image-viewer` | ViewScreen | DICOM 图像查看（Cornerstone Stack / MPR，窗宽窗位缩放） |
| `/mobile/manual-scan` | ManualScanScreen | 手动扫描控制 |
| `/mobile/mock-scan` | MockScanScreen | 模拟扫描 |
| `/mobile/image-viewer` | ViewScreen | 移动端图像查看（复用 ViewScreen） |
| `/service/tube-warmup` | TubeWarmupScreen | 球管预热 |
| `/service/air-calibration` | AirCalibrationScreen | 空气校准 |
| `/service/daily-qa` | DailyQAScreen | 日检 |
| `/service/hardware-test` | HardwareTestScreen | 硬件诊断 |
| `/service/battery` | BatteryManagementScreen | 电池管理 |
| `/service/disk` | DiskManagementScreen | 磁盘管理 |
| `/service/performance` | PerformanceEvaluationScreen | 性能评估 |
| `/service/settings/protocol-management` | ProtocolManagementScreen | 协议管理 |
| `/service/settings/corner-info` | CornerInfoPage | 角点信息 |
| `/service/settings/dicom` | ServicePlaceholderScreen | DICOM 配置（占位） |
| `/service/settings/user-management` | ServicePlaceholderScreen | 用户管理（占位） |
| `/service/settings/system-settings` | ServicePlaceholderScreen | 系统设置（占位） |
| `/service/settings/organization-info` | ServicePlaceholderScreen | 机构信息（占位） |
| `/service/reports/qa-report` | QAReportPage | QA 报告 |
| `/service/reports/system-log` | ServicePlaceholderScreen | 系统日志（占位） |
| `/service/reports/runtime-stats` | ServicePlaceholderScreen | 运行统计（占位） |
| `/service/reports/audit-log` | ServicePlaceholderScreen | 审计日志（占位） |
| `/service/dose/settings` | ServicePlaceholderScreen | 剂量设置（占位） |
| `/service/dose/logs` | ServicePlaceholderScreen | 剂量日志（占位） |

> 未匹配的路径统一重定向到 `/patients`。

---

## 典型操作流程

### 普通扫描流程

```
患者列表 → 选择患者
→ 协议选择 (/protocol-select)
→ 协议编辑 (/protocol-detail → scout/helical/recon/dose)
→ 激光定位 (/scout-scan)
→ 参数确认 (/scan-confirm)
→ 定位像执行 (/scout-execute) ← WebSocket 实时状态
→ 螺旋确认/执行 (/helical-confirm → /helical-execute)
→ 图像查看 (/image-viewer)
```

### 4D 呼吸门控流程

```
选择 4D 协议 (acquisition_type = "4d")
→ 诊断扫描确认 (/fourd-confirm)
→ 4D 断层采集 (WebSocket 实时呼吸波形)
→ 时相回顾 (/fourd-phase-review) ← 浏览各时相图像
→ 重扫选择 (/fourd-rescan-select) ← 呼吸波形峰谷点拖拽增删、标识剂量区
→ 图像查看 (/image-viewer)
```

---

## 预置协议种子数据

`backend/database.py` 初始化时自动载入 100+ 协议，覆盖：

| 部位 | 示例协议 |
|------|----------|
| HEAD | 脑部平扫、鼻窦、内听道、CTA 头颈 |
| NECK | 颈部软组织、颈椎 |
| CHEST | 胸部常规、肺动脉 CTA、儿童胸部、4D 胸部 |
| SPINE | 颈椎、胸椎、腰椎 |
| ABDOMEN | 腹部平扫/增强、肝脏三期 |
| PELVIS | 盆腔平扫/增强 |
| EXTREMITY | 膝关节、腕关节 |

每个部位含成人/儿童/婴幼儿变体，以及平扫/增强/4D 模式。

---

## Git 工作流约定

- **主分支**：`master`（唯一长期分支）
- **工作方式**：直接在 `master` 提交；Codex 分支合并回 master 后立即清理
- **提交信息**：`feat:` / `fix:` / `refactor:` + 简短描述；中文短描述也接受
- **避免**：分支堆积、无意义 commit（如"备份"）

---

## 当前已知问题 / 待办

1. **CORS 端口未匹配**：后端白名单缺少实际前端端口（如 5175），可能被浏览器拦截
2. **部分组件可能硬编码 `localhost:8000`**，未全部走 `VITE_API_BASE_URL`
3. **WebSocket 为模拟实现**：`scan_ws.py` 发送随机数据，非真实设备
4. **app.db 已入版本库**：易产生冲突，建议加入 `.gitignore`
5. **多个服务模式页面为 ServicePlaceholderScreen 占位**，尚未实现具体功能

---

## 给 AI 助手的工作建议

- **后端修改**：先看 `backend/models.py` → `schemas.py` → 对应 `routers/*.py`
- **前端页面**：新页面放 `screens/`；复杂模块拆到 `features/<name>/`（参考 `features/protocolDetail` 与 `features/service/*`）
- **扫描工作流状态**：读 `lib/scanWorkflowSession.ts` + `lib/scanSession.ts` + `lib/scoutPositioningSession.ts`
- **DICOM 相关**：优先复用 `components/CornerstoneStackViewport.tsx` / `CornerstoneMPRViewport.tsx`，初始化逻辑在 `lib/cornerstone/initCornerstone.ts`
- **4D 判定**：使用 `acquisition_type === "4d"` 而非按名称匹配
- **扫描参数**：kV=管电压，mA=管电流，pitch=螺距，FOV=扫描视野，WL/WW=窗位/窗宽
- **数据库重置**：`python backend/reset_db.py`
- **前端平板外壳**：`App.tsx` 内置 1024×768 平板尺寸与自适应缩放；新页面以该尺寸为准设计

## Git Rules
- Always commit directly to the current branch (master)
- Do NOT create new branches
- Do NOT push automatically; I will push manually
