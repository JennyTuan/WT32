# CT-Prototype

> **AI 协作说明**：本文档专为 AI 助手（Claude、ChatGPT 等）撰写，旨在让任何 AI 无需额外问答即可快速理解项目并展开工作。

---

## 项目概述

这是一款 **CT 扫描仪控制与管理系统**原型，模拟真实 CT 机的操作界面，涵盖：

- 患者管理（登记、查询）
- 扫描协议管理（100+ 预置协议，支持头部/颈部/胸部/脊柱/腹部等）
- 完整扫描工作流（定位像 → 螺旋扫描 → 图像重建）
- 4D 呼吸门控扫描
- DICOM 图像查看
- 设备服务功能（球管预热、空气校准、日检）

**目标用户**：产品经理主导，用于 UI/UX 设计验证，非临床使用。

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
| 图标 | Lucide React |
| 本地数据库 | Dexie 4.3.0（IndexedDB） |
| DICOM 解析 | dicom-parser 1.8.21 |

---

## 目录结构

```
CT-Prototype/
├── backend/                    # Python FastAPI 后端
│   ├── main.py                 # 应用入口，CORS 配置，路由注册
│   ├── models.py               # SQLAlchemy ORM 数据模型
│   ├── schemas.py              # Pydantic 请求/响应 Schema
│   ├── database.py             # 数据库初始化 + 100+ 协议种子数据
│   ├── reset_db.py             # 重置数据库工具脚本
│   ├── requirements.txt        # Python 依赖
│   ├── app.db                  # SQLite 数据库文件
│   ├── routers/
│   │   ├── patients.py         # 患者 CRUD
│   │   ├── protocols.py        # 协议与序列管理
│   │   ├── scan_params.py      # 定位像/螺旋/轴扫参数
│   │   ├── recon_params.py     # 重建序列参数
│   │   └── contrast_configs.py # 对比剂配置
│   └── websocket/
│       └── scan_ws.py          # 模拟扫描控制 WebSocket
│
├── ui-review/                  # React TypeScript 前端
│   ├── .env                    # VITE_API_BASE_URL=http://localhost:8000
│   ├── vite.config.ts          # Vite 配置（未配置代理）
│   ├── package.json            # npm 依赖与脚本
│   ├── tailwind.config.js      # Tailwind 配置
│   └── src/
│       ├── App.tsx             # 路由定义（所有页面路由）
│       ├── main.tsx            # React 入口
│       ├── Gallery.tsx         # 组件展示画廊（非路由，仅设计审查用）
│       ├── screens/            # 35 个页面组件（见下方路由表）
│       ├── components/
│       │   ├── DicomViewer.tsx         # DICOM 图像渲染组件
│       │   └── ProtocolEditorModal.tsx # 协议编辑弹窗
│       └── lib/
│           └── protocolDb.ts   # Dexie IndexedDB 本地协议库
│
└── .claude/
    └── launch.json             # Claude Code 服务启动配置
```

---

## 本地开发启动

### 前置要求
- Python 3.13+
- Node.js 18+
- 已安装 uvicorn（`pip install -r backend/requirements.txt`）

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

### 访问地址
| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:5175 |
| 后端 API | http://localhost:8000 |
| API 文档（自动生成） | http://localhost:8000/docs |

### ⚠️ 已知问题：CORS 配置与实际端口不匹配
`backend/main.py` 中 CORS 白名单为 `localhost:3000` 和 `localhost:5173`，
但前端实际运行在 **5175**。如遇跨域报错，需将 `5175` 加入 `main.py` 的 `allow_origins`：
```python
allow_origins=[
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5175",   # ← 需要添加
    "http://127.0.0.1:5175",   # ← 需要添加
]
```

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

patients (独立表，与协议无外键关联)
```

### 主要字段说明

**patients**
- `name`, `patient_id`, `gender`, `birth_date`, `height`, `weight`

**protocols**
- `name`, `body_part`（HEAD/NECK/CHEST/SPINE/ABDOMEN/PELVIS/EXTREMITY）
- `age_group`（adult/child/infant）
- `scan_mode`（plain/contrast/4d）
- `position`（head_first/feet_first）

**series**
- `series_type`（topogram/helical/axial/4d）
- `series_order`（序列顺序，唯一约束）

**helical_params**（螺旋扫描核心参数）
- `kv`（管电压），`auto_ma`（自动毫安），`min_ma`/`max_ma`
- `pitch`（螺距），`rotation_time`（旋转时间）
- `scan_length`，`fov`，`slice_thickness`

**recon_series**（图像重建）
- `kernel`（算法：Brain2/Lung2/Bone2/S2/S3）
- `matrix`，`window_level`，`window_width`
- `slice_thickness`，`slice_interval`

---

## API 端点一览

**Base URL: `http://localhost:8000`**

```
GET    /                                  # 健康检查

# 患者
GET    /api/patients/                     # 患者列表
POST   /api/patients/                     # 新建患者
GET    /api/patients/{id}                 # 患者详情
PUT    /api/patients/{id}                 # 更新患者
DELETE /api/patients/{id}                 # 删除患者

# 协议序列
GET    /api/protocols/series/             # 所有序列
POST   /api/protocols/series/             # 新建序列
GET    /api/protocols/series/{id}         # 序列详情（含所有关联参数）
PUT    /api/protocols/series/{id}         # 更新序列
DELETE /api/protocols/series/{id}         # 删除序列

# 扫描参数
GET/POST       /api/scan-params/topogram/ # 定位像参数
PUT            /api/scan-params/topogram/{id}
GET/POST       /api/scan-params/helical/  # 螺旋参数
PUT            /api/scan-params/helical/{id}
GET/POST       /api/scan-params/axial/    # 轴扫参数
PUT            /api/scan-params/axial/{id}

# 重建序列
GET/POST       /api/recon-series/
PUT/DELETE     /api/recon-series/{id}

# 对比剂配置
GET/POST       /api/contrast-configs/
PUT/DELETE     /api/contrast-configs/{id}

# WebSocket（模拟扫描事件流）
WS  /ws/scan-control
```

**WebSocket 事件类型：**
- `SCAN_STATUS` — 扫描机状态（Idle/Running/Paused/Stopped）
- `INJECTOR_STATUS` — 高压注射器进度
- `BREATHING_WAVE` — 呼吸波形振幅
- `SCAN_PROGRESS` — 各序列扫描进度
- `IMAGE_READY` — 图像就绪通知

---

## 前端路由表

| 路由 | 组件 | 说明 |
|------|------|------|
| `/patients` | PatientListScreen | 患者列表，支持搜索/新增/删除 |
| `/protocol-select` | ProtocolSetupScreen | 协议库选择 |
| `/protocol-detail` | WT32ProtocolDetailScreen | 协议主编辑界面 |
| `/protocol-detail/scout` | WT32NewProtocolScoutDetailScreen | 定位像参数编辑 |
| `/protocol-detail/helical` | WT32NewProtocolHelicalDetailScreen | 螺旋参数编辑 |
| `/protocol-detail/recon` | WT32NewProtocolReconDetailScreen | 重建参数编辑 |
| `/protocol-detail/dose` | WT32NewProtocolDoseDetailScreen | 剂量通知 |
| `/scout-scan` | ScoutScanScreen | 激光定位界面 |
| `/scan-confirm` | ScanConfirmScreen | 扫描参数确认 |
| `/scout-execute` | ScoutExecuteScanScreen | 定位像执行（含 WebSocket） |
| `/sequence-confirm` | SequenceScanConfirmScreen | 序列参数确认 |
| `/helical-confirm` | HelicalScanConfirmScreen | 螺旋参数确认 |
| `/helical-execute` | HelicalExecuteScanScreen | 螺旋扫描执行 |
| `/image-viewer` | ViewScreen | DICOM 图像查看（窗宽/窗位/缩放） |
| `/mobile/manual-scan` | ManualScanScreen | 手动扫描控制 |
| `/mobile/mock-scan` | MockScanScreen | 模拟扫描（测试用） |
| `/mobile/image-viewer` | 移动端图像查看 | |
| `/4d-breathing-prep` | FourDBreathingPreparationWorkflowScreen | 4D 呼吸准备流程 |
| `/breathing-training` | BreathingTrainingWorkflowScreen | 呼吸训练流程 |
| `/breathing-acquisition` | BreathingAcquisitionWorkflowScreen | 4D 采集流程 |
| `/free-breathing-confirm` | FreeBreathingModeConfirmWorkflowScreen | 自由呼吸确认 |
| `/4d-view` | FourDViewScreen | 4D 时序图像查看 |
| `/service/tube-warmup` | TubeWarmupScreen | 球管预热 |
| `/service/air-calibration` | AirCalibrationScreen | 空气校准 |
| `/service/daily-qa` | DailyQAScreen | 日检流程 |
| `/service/hardware-test` | HardwareTestScreen | 硬件诊断 |
| `/service/battery` | BatteryManagementScreen | 电池管理 |
| `/service/disk` | DiskManagementScreen | 磁盘管理 |
| `/service/performance` | PerformanceEvaluationScreen | 性能评估 |

---

## 典型操作流程

### 普通扫描流程
```
患者列表 → 选择患者
→ 协议选择（/protocol-select）
→ 协议编辑（/protocol-detail）
  → 定位像参数（/protocol-detail/scout）
  → 螺旋参数（/protocol-detail/helical）
  → 重建参数（/protocol-detail/recon）
→ 激光定位（/scout-scan）
→ 参数确认（/scan-confirm）
→ 扫描执行（/scout-execute）← WebSocket 实时状态
→ 图像查看（/image-viewer）
```

### 4D 呼吸门控流程
```
选择 4D 协议
→ 呼吸准备（/4d-breathing-prep）
→ 呼吸训练（/breathing-training）← 患者练习呼吸
→ 4D 采集（/breathing-acquisition）← 实时呼吸波形
→ 4D 图像查看（/4d-view）← 时序帧回放
```

---

## 预置协议种子数据

数据库初始化时自动载入 100+ 协议（`backend/database.py`），覆盖：

| 部位 | 示例协议 |
|------|----------|
| HEAD（脑部） | 脑部平扫、鼻窦、内听道、CTA 头颈 |
| NECK（颈部） | 颈部软组织、颈椎 |
| CHEST（胸部） | 胸部常规、肺动脉 CTA、儿童胸部 |
| SPINE（脊柱） | 颈椎、胸椎、腰椎 |
| ABDOMEN（腹部） | 腹部平扫/增强、肝脏三期 |
| PELVIS（盆腔） | 盆腔平扫/增强 |
| EXTREMITY（四肢） | 膝关节、腕关节 |

每个部位包含成人/儿童/婴幼儿变体，以及平扫/增强/4D 模式。

---

## Git 工作流约定

- **主分支**：`master`（唯一长期分支）
- **工作方式**：小改动直接在 `master` 提交；较大功能开短命分支，完成后立即合并并删除分支
- **提交信息格式**：`feat:` / `fix:` / `refactor:` + 英文简短描述
- **避免**：让分支堆积、提交无意义信息（如"备份"、"修改编码"）

---

## 当前已知问题 / 待办

1. **CORS 端口未匹配**：后端白名单缺少 `5175`，可能导致 API 请求被浏览器拦截
2. **前端 API 调用未全部使用 .env 变量**：部分组件可能仍硬编码 `localhost:8000`
3. **WebSocket 为模拟实现**：`scan_ws.py` 发送的是随机模拟数据，非真实设备数据
4. **app.db 已纳入版本控制**：数据库文件被提交进 git，团队协作时可能产生冲突，建议加入 `.gitignore`

---

## 给 AI 助手的工作建议

- **修改后端逻辑**：优先看 `backend/models.py`（数据结构）→ `schemas.py`（接口格式）→ 对应 router
- **修改/新增页面**：参考现有 `screens/` 中相似页面的写法，保持 Tailwind 样式一致性
- **理解扫描参数含义**：kV=管电压，mA=管电流，pitch=螺距，FOV=扫描视野，WL/WC=窗位/窗宽
- **数据库重置**：运行 `python backend/reset_db.py` 可清空并重新种入种子数据
- **组件预览**：访问 `/gallery`（Gallery.tsx）可查看所有 UI 组件的静态展示