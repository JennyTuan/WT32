# AGENTS.md — CT-Prototype 智能协作指引

> 本文件是 AI 编程助手（Claude、Codex、Cursor 等）的首要参考文档。  
> 阅读本文件后即可理解项目定位、技术栈、UI 规范、医疗原则与工作方式，无需再问额外问题。  
> 专业术语与领域知识详见 **CONTEXT.md**。

---

## 一、项目背景

**项目名称**：CT-Prototype  
**项目性质**：CT 扫描仪控制端原型系统（用于产品/UI 验证，非临床用途）  
**目标用户**：产品经理、研发工程师（用于内部需求快速验证）  
**参考角色**：真实 CT 机的放射科技师操作台

### 核心功能模块

| 模块 | 说明 |
|------|------|
| 患者管理 | 登记、查询、新增患者信息 |
| 扫描协议管理 | 100+ 预置协议模板，覆盖 7 个解剖部位 |
| 扫描工作流 | 定位像 → 螺旋/断层扫描 → 图像重建的完整流程 |
| 4D 呼吸门控 | 诊断确认 → 断层采集 → 时相回顾 → 重扫选择 |
| DICOM 图像查看 | Cornerstone3D，支持 Stack 与 MPR 视图 |
| 设备服务功能 | 球管预热、空气校准、日检、硬件测试、磁盘管理、性能评估、QA 报告等 |

### 系统运行环境

- 屏幕尺寸：**1024×768** 平板（前端以此为设计基准，窗口自动缩放）
- 操作方式：Touch UI，兼顾鼠标
- 运行场景：医疗扫描工作站

---

## 二、技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.13+ | 运行时 |
| FastAPI | 0.115.12 | REST API 框架 |
| Uvicorn | 0.34.0 | ASGI 服务器 |
| SQLAlchemy | 2.0.39 | ORM |
| SQLite | — | 数据库（`backend/app.db`） |
| Pydantic | 2.11.2 | 数据校验与 Schema |

关键文件读取顺序：`models.py` → `schemas.py` → `routers/*.py` → `websocket/scan_ws.py`

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.0 | UI 框架 |
| TypeScript | 5.9.3 | 类型安全 |
| Vite | 7.3.1 | 构建工具 |
| Tailwind CSS | 3.4.17 | 样式 |
| React Router DOM | 7.13.2 | 路由 |
| Cornerstone3D | 4.20.1 | DICOM 图像渲染（Stack / MPR） |
| dicom-parser | 1.8.21 | DICOM 文件解析 |
| Dexie | 4.3.0 | IndexedDB 包装，用于本地协议库缓存 |
| @dnd-kit | 6.x/10.x | 拖拽交互 |
| Lucide React | 0.575 | 图标 |
| html2canvas | 1.4.1 | 截图导出 |

> **注意**：项目 package.json 中无 Zustand，状态管理通过 localStorage + React state + Dexie 实现。

关键文件读取顺序：`App.tsx` → `lib/scanWorkflowSession.ts` → `lib/scanSession.ts` → `screens/` → `features/`

---

## 三、目录结构

```
CT-Prototype/
├── backend/
│   ├── main.py                  # 应用入口、CORS、路由注册
│   ├── models.py                # ORM 模型（模板域 + 执行域双层结构）
│   ├── schemas.py               # Pydantic Schema
│   ├── database.py              # 数据库初始化 + 100+ 协议种子数据
│   ├── reset_db.py              # 重置数据库工具
│   ├── app.db                   # SQLite 数据库（勿提交）
│   ├── routers/
│   │   ├── patients.py          # 患者 CRUD
│   │   ├── protocols.py         # 协议与序列管理
│   │   ├── scan_params.py       # 定位像/螺旋/轴扫参数
│   │   ├── recon_params.py      # 重建序列参数
│   │   ├── contrast_configs.py  # 对比剂配置
│   │   ├── scan_sessions.py     # 扫描会话生命周期（核心业务编排）
│   │   ├── corners.py           # 角点信息（服务模式）
│   │   └── disk_manager.py      # 磁盘管理（服务模式）
│   └── websocket/
│       └── scan_ws.py           # 模拟扫描控制 WebSocket
│
├── ui-review/
│   ├── .env                     # VITE_API_BASE_URL=http://localhost:8000
│   └── src/
│       ├── App.tsx              # 路由定义 + 1024×768 平板外壳缩放
│       ├── screens/             # 业务页面（40+）
│       ├── features/
│       │   ├── protocolDetail/  # 协议详情复杂模块（组件/hooks/types 拆分）
│       │   └── service/         # 服务模式子模块
│       ├── components/
│       │   ├── DicomViewer.tsx
│       │   ├── CornerstoneStackViewport.tsx
│       │   ├── CornerstoneMPRViewport.tsx
│       │   └── ProtocolEditorModal.tsx
│       └── lib/
│           ├── scanSession.ts           # 后端扫描会话 API + localStorage 缓存
│           ├── patientSession.ts        # 当前患者上下文
│           ├── scanWorkflowSession.ts   # 跨页面工作流状态机
│           ├── scoutPositioningSession.ts
│           ├── fourDTypes.ts            # 4D 相关类型定义
│           ├── protocolDb.ts            # Dexie 协议库
│           └── cornerstone/
│               └── initCornerstone.ts   # Cornerstone3D 初始化
│
├── docs/                        # 技术文档与分析报告
├── AGENTS.md                    # 本文件
└── CONTEXT.md                   # 领域知识库（术语/医疗知识）
```

---

## 四、UI 规范

### 布局结构

```
┌─────────────────────────────────────────┐  ← 1024px
│         顶部状态栏（固定）                │  ← 约 56px
├─────────────────────────────────────────┤
│                                         │
│         中间区域（扫描工作区/主内容）      │  ← 弹性填充
│                                         │
├─────────────────────────────────────────┤
│         底部流程栏（固定）                │  ← 约 80px
└─────────────────────────────────────────┘
                                            ↑ 768px
```

- **顶部状态栏**：显示患者信息、检查状态、系统时间
- **底部流程栏**：显示当前工作流步骤、前进/后退操作按钮
- **中间区域**：扫描参数编辑、图像查看、协议选择等主要工作内容
- 所有新页面以 **1024×768** 为设计基准，不用考虑更大的屏幕

### 样式规范

- 使用 **Tailwind CSS** 原子类，不另建 CSS 文件
- 颜色系统：深色医疗风格（深灰/蓝色主色调）
- 字体：系统默认字体，代码/参数值用等宽字体
- 图标：统一使用 **Lucide React**
- 交互：Touch 友好，按钮最小点击区域 44×44px
- 参数输入框：医疗级精度（小数位数要与真实 CT 一致）

### 路由表（主要页面）

| 路由 | 页面说明 |
|------|---------|
| `/patients` | 患者列表（默认入口） |
| `/protocol-select` | 协议库选择 |
| `/protocol-detail` | 协议主编辑界面 |
| `/protocol-detail/scout` | 定位像参数编辑 |
| `/protocol-detail/helical` | 螺旋参数编辑 |
| `/protocol-detail/recon` | 重建参数编辑 |
| `/protocol-detail/dose` | 剂量/通知阈值 |
| `/scout-scan` | 激光定位 |
| `/scan-confirm` | 扫描参数确认 |
| `/scout-execute` | 定位像执行（WebSocket） |
| `/helical-confirm` | 螺旋参数确认 |
| `/helical-execute` | 螺旋扫描执行 |
| `/fourd-confirm` | 4D 诊断扫描确认 |
| `/fourd-phase-review` | 4D 时相回顾 |
| `/fourd-rescan-select` | 4D 重扫选择 |
| `/image-viewer` | DICOM 图像查看 |
| `/service/*` | 设备服务功能（见 README） |

---

## 五、数据模型架构

### 双层结构设计

后端数据模型分为两层，这是理解整个系统的关键：

```
模板层（Protocol Domain）          执行层（Scan Session Domain）
────────────────────────          ──────────────────────────────
Protocol                    →克隆→  ScanSession
  └── Series                        └── ScanSessionSeries
        ├── TopogramParam                  ├── ScanSessionTopogramParam
        ├── HelicalParam                   ├── ScanSessionHelicalParam
        ├── AxialParam                     ├── ScanSessionAxialParam
        ├── ReconSeries (1:N)              ├── ScanSessionReconSeries
        ├── FourDConfig                    ├── ScanSessionFourDConfig
        │     └── BreathingTrainingParam   │     └── ScanSessionBreathingTrainingParam
        └── ContrastConfig                 └── ScanSessionContrastConfig
```

**设计意图**：协议模板可持续维护；每次检查生成独立会话快照；会话内改参支持个体化，不污染模板。

### 关键字段含义

**protocols 表**：
- `body_part`：HEAD / NECK / CHEST / SPINE / ABDOMEN / PELVIS / EXTREMITY
- `age_group`：adult / child / infant
- `scan_mode`：plain（平扫）/ contrast（增强）/ 4d
- `position`：head_first / feet_first

**series 表**：
- `series_type`：topogram / helical / axial / 4d
- `acquisition_type`：`regular` | `4d` — **判断是否走 4D 门控分支的唯一依据**，禁止按协议名称字符串匹配

**helical_params 表**（主要扫描参数）：
- `kv`：管电压（kV）
- `auto_ma`、`min_ma`、`max_ma`：自动管电流及范围（mA）
- `pitch`：螺距
- `rotation_time`：机架旋转时间（秒）
- `scan_length`：扫描长度（mm）
- `fov`：扫描视野（mm）
- `slice_thickness`：层厚（mm）
- `ctdi_vol`：CT 剂量指数（mGy）
- `dlp`：剂量长度乘积（mGy·cm）
- `dom`：器官剂量调节配置（应为枚举，非 "动态扫描"）

**recon_series 表**（重建参数）：
- `kernel`：重建滤波函数（Brain2 / Lung2 / Bone2 / S2 / S3）
- `window_level` / `window_width`：窗位 / 窗宽
- `slice_thickness`、`slice_interval`：层厚 / 层间距（mm）
- `matrix`：重建矩阵（通常 512×512）

---

## 六、扫描工作流

### 普通扫描流程

```
患者列表 → 选择患者
→ 协议选择 (/protocol-select)
→ 协议编辑 (/protocol-detail → scout/helical/recon/dose)
→ 激光定位 (/scout-scan)
→ 参数确认 (/scan-confirm)
→ 定位像执行 (/scout-execute) ← WebSocket 实时状态
→ 螺旋确认 (/helical-confirm)
→ 螺旋执行 (/helical-execute)
→ 图像查看 (/image-viewer)
```

### 4D 呼吸门控流程

```
选择 4D 协议（acquisition_type = "4d"）
→ 诊断扫描确认 (/fourd-confirm)
→ 4D 断层采集（WebSocket 实时呼吸波形）
→ 时相回顾 (/fourd-phase-review) ← 浏览各时相图像
→ 重扫选择 (/fourd-rescan-select) ← 呼吸波形峰谷拖拽、标识剂量区
→ 图像查看 (/image-viewer)
```

### WebSocket 事件类型

`SCAN_STATUS` / `INJECTOR_STATUS` / `BREATHING_WAVE` / `SCAN_PROGRESS` / `IMAGE_READY`

> WebSocket 当前为模拟实现（随机数据），不代表真实设备协议。

---

## 七、医疗安全原则

这是 CT 设备软件，以下原则**不可违反**：

1. **参数边界必须校验**：kV、mA、FOV、层厚、螺距等参数必须有合理上下限，不允许接受超出临床范围的值
2. **不允许危险默认值**：任何扫描参数的默认值必须是临床安全值（参考真实 CT 协议范围）
3. **剂量展示必须准确**：CTDIvol、DLP 等剂量指标显示时须标注单位（mGy、mGy·cm），并说明"预计值/参考值"
4. **不允许绕过确认流程**：扫描执行前必须经过参数确认页，不能跳过
5. **DOM 不等于"动态扫描"**：DOM（Dynamic Organ Dose Modulation）是器官剂量保护，与 4D 动态扫描是完全不同的概念，文案和代码均需区分
6. **4D 判定使用字段，不使用名称匹配**：`acquisition_type === "4d"` 是唯一判断依据
7. **模板与会话隔离**：协议模板修改不应影响已进行中的扫描会话；会话内改参不应反写模板（除非用户明确操作）
8. **儿童/婴幼儿协议特殊保护**：age_group = child/infant 时，剂量相关默认值应更保守

---

## 八、开发工作方式

### 接手任务时的阅读顺序

1. `CONTEXT.md` — 理解领域术语
2. `backend/models.py` — 理解数据结构全貌
3. `backend/routers/scan_sessions.py` — 理解核心业务编排
4. `ui-review/src/lib/scanSession.ts` — 理解前后端连接点
5. 相关 `screens/` 页面文件

### 分工规范

- **新页面**：放 `screens/`
- **复杂页面模块**（多组件/hooks/types）：拆到 `features/<name>/`，参考 `features/protocolDetail/`
- **公共组件**：放 `components/`
- **状态/工具**：放 `lib/`

### 实现规范

- **先分析需求，再建状态机，再生成 UI** — 避免直接生成大文件
- **优先小步提交** — 每次只做一件事
- **复用优先**：DICOM 相关优先复用 `CornerstoneStackViewport.tsx` / `CornerstoneMPRViewport.tsx`
- **API 地址**：统一走 `VITE_API_BASE_URL`，不硬编码 `localhost:8000`
- **不要引入不存在的依赖**：先确认 package.json 中已有库
- **数据库重置**：`python backend/reset_db.py`

### 常见陷阱

| 陷阱 | 正确做法 |
|------|---------|
| 按协议名称判断 4D | 使用 `acquisition_type === "4d"` |
| DOM 写成"动态扫描" | DOM = 器官剂量调节，与 4D 无关 |
| 前端直接改模板数据 | 要通过扫描会话克隆，修改会话副本 |
| 扫描参数不校验边界 | 所有参数字段必须有 min/max 校验 |
| 新建 CSS 文件 | 使用 Tailwind 原子类 |
| 引入 Zustand | 项目无 Zustand，用 localStorage + React state |
| 在 helical_params 展示复杂 DOM 配置 | DOM 配置入口在 `/protocol-detail/dose` |

---

## 九、启动与调试

```bash
# 后端
uvicorn backend.main:app --reload --port 8000

# 前端
cd ui-review && npm run dev

# 一键同时启动
cd ui-review && npm run dev:all
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5175 |
| 后端 API | http://localhost:8000 |
| API 文档 | http://localhost:8000/docs |

**已知问题**：后端 CORS 白名单默认含 5173，若 Vite 启动到 5175，需在 `backend/main.py` 的 `allow_origins` 补充。

---

## 十、Git 规范

- **只使用 master 分支**，直接提交，不创建 feature 分支
- **不自动 push**，用户手动 push
- **提交格式**：`feat:` / `fix:` / `refactor:` + 简短描述（中文可接受）
- **避免**：无意义 commit（如"备份"）、大文件提交（如 app.db）
