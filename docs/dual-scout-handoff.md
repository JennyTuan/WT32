# 双定位像功能整改交接文档

> 项目：WT32 CT 工作站演示原型
> 范围：在现有单定位像扫描流程基础上增加"双定位像（AP + LAT 正侧位）"协议演示
> 状态：核心链路已通，**helical-confirm 双图存在阻塞 bug 未解决**
> 写于：2026-06-22

---

## 1. 背景与目标

### 业务目标
- 在协议库里增加一个"头部双定位"演示协议，扫描时同时采集 AP（正位 0°）+ LAT（侧位 90°）两张定位像
- 后续 helical-confirm 上左右并排显示两张定位像，扫描范围（Z 轴 y/height）双向联动同步，FOV/中心位置（x/width）各自独立
- 仅是演示原型，不需要数据库迁移或正式 PRD 更新

### 技术约束
- 前端：Vite + React 18 + TypeScript + cornerstone/dicom-parser
- 后端：FastAPI + SQLite
- 真实 CT 协议数据模型已经支持一个 protocol 挂多条 series（`series_type='topogram'` 可有多条），所以双定位选的是**协议级双 topogram series**，不是给单 topogram_param 加第二角度字段

---

## 2. 数据资产

### DICOM 素材
来源：`backend/data/20160504 192137 [ - CT Acute Stroke]/Series 001 [CT - 2 0]/`
- AP scout（冠状面，IOP=`[1,0,0,0,0,-1]`）→ 复制为 `ui-review/public/dicom/head-dual-scout/scout-ap.dcm`
- LAT scout（矢状面，IOP=`[0,0,-1,0,1,0]`）→ 复制为 `ui-review/public/dicom/head-dual-scout/scout-lat.dcm`
- 两张参数相同：120 kVp / 50 mA / 512×512 / 1mm pixel spacing / FOV 500 / HEAD / HFS

### 数据库种子
`backend/app.db` 已插入协议 **id=140，name="头部双定位"**，含三条 series：
| series_order | series_type | label | tube_angle |
|---|---|---|---|
| 1 | topogram | 定位像 AP | 0° |
| 2 | topogram | 定位像 LAT | 90° |
| 3 | helical | 头部螺旋扫描 | — |

`helical_param` 从协议 id=1（头部常规）克隆。

---

## 3. 已实现的代码改动

### 后端
**`backend/main.py`** — 新增 manifest 端点 `/api/demo-dicom/head-dual-scout`：
- 读取两个 DICOM 头，识别 IOP 推断 AP/LAT，返回 `{studyId, defaultWindowWidth, defaultWindowLevel, series:[{key:'scout-ap',view,tubeAngle,url,...},{key:'scout-lat',...}]}`
- DICOM 文件经现有 `/dicom/...` 路由直接服务（因为放在了 `public/dicom/` 下）

### 前端
**新建 `ui-review/src/lib/headDualScoutDemo.ts`** — 仿 `limbsDicomDemo.ts`：
- 导出 `isHeadDualScoutName` / `isHeadDualScoutWorkflow` / `isHeadDualScoutSession`：通过 `name.includes("头部双定位")` 识别
- 导出 `loadHeadDualScoutManifest()`（memoized fetch）+ `getHeadDualScoutSeries(manifest, key)`
- 导出类型 `HeadDualScoutManifest` / `HeadDualScoutSeries`

**`ui-review/src/screens/ScoutExecuteScanScreen.tsx`** — 双图采集 + 两阶段执行动画：
- 检测 `isHeadDualScoutFlow` 时加载 manifest，构造 `headDualApSeries` / `headDualLatSeries`
- 新增 `dualPhase` state（`"ap_exposing" | "ap_rendering" | "rotating" | "lat_exposing" | "lat_rendering" | "done" | null`）
- 新增 `performTriggerScanDual()`：长按触发后依次执行 AP 曝光（1.2s）→ AP 渲染动画（2.2s）→ 机架旋转动画（1.5s）→ LAT 曝光 → LAT 渲染 → completed
- JSX：dual 模式下用 `grid grid-cols-2` 渲染两个 `ScoutProjectionViewport`，右侧 LAT 视口在 rotating/lat_exposing 阶段显示占位 overlay（"机架旋转 90°" / "LAT 曝光中"）
- 角标显示阶段状态："采集中" / "✓" / "等待"

**`ui-review/src/screens/HelicalScanConfirmScreen.tsx`** — 双图并排 + Z 联动（**有 bug，见 §4**）：
- 检测 `isHeadDualScoutFlow` 时加载 manifest，构造 `headDualApOverride` / `headDualLatOverride`（`TomographicScoutSeriesOverride` 类型）
- 父组件 state：`apCropBox` / `latCropBox`（独立两个 cropBox 状态对象）
- `useCallback` 包装的稳定回调：
  - `handleMeasurementChangeIdem`：幂等 setMeasurements（同值短路）
  - `handleApCropBoxChange`：写 `scoutCropBox` + 幂等更新 `apCropBox` + 把 box.y/box.height 同步到 `latCropBox`（保留 LAT 自己的 x/width）
  - `handleLatCropBoxChange`：反向同理
- JSX：dual 分支下 `<div className="grid h-full grid-cols-2 gap-[3px]">`，每格 `<div className="relative flex h-full overflow-hidden ...">` 包裹一个 `TomographicScoutViewport`，分别传入各自的 `seriesOverride` + `cropBoxOverride` + `onCropBoxChange`
- 单 scout 协议走原 else 分支保持不变

**`ui-review/src/screens/SequenceScanConfirmScreen.tsx`** —`TomographicScoutViewport` 加受控 prop：
- 新增可选 `cropBoxOverride?: CropBox` prop
- 新增 sync useEffect：当 `cropBoxOverride` 变化且与内部 `cropBoxRef.current` 差异 > 1e-4 时调用 `setCropBox(cropBoxOverride)`
- 加 `dragStateRef.current` 守卫：用户正在拖拽时不应用 override（防止拖拽过程中被父组件 round-trip 状态打断）

---

## 4. 阻塞 Bug — helical-confirm 渲染死循环

### 现象
进入 `/helical-confirm` 路由后 React 持续抛 `Maximum update depth exceeded`（日志几百条）。表象：
- 定位框（crop box）DOM 节点在闪烁
- 用户无法拖动定位框
- 浏览器卡顿

### 已尝试的修复（全部无效）
按时间顺序：

1. **`useCallback` 稳定回调引用**
   - 把 JSX 里的内联 `onMeasurementChange={(v)=>...}` / `onCropBoxChange={(box)=>...}` 全部提取到组件顶部用 `useCallback(..., [])` 包装
   - 理论：避免父组件每次 render 都给子组件传新函数引用，导致子组件 `useEffect [cropBox, onMeasurementChange]` 反复 fire
   - 结果：死循环仍在

2. **`setMeasurements` / `setApCropBox` / `setLatCropBox` 全部改幂等**
   ```js
   setApCropBox((prev) => (
     Math.abs(prev.x - box.x) < 1e-4 && ... ? prev : box
   ));
   ```
   - 同值 short-circuit，避免引用变化触发下游 effect
   - 结果：死循环仍在

3. **`cropBoxOverride` sync useEffect 加 dragStateRef 守卫**
   - 用户拖拽期间不让父组件的受控值打回来覆盖内部 state
   - 结果：死循环仍在

4. **移除 LAT 的 `initialMeasurements` prop**
   - LAT 不再依赖父组件 measurements，只通过 Z-sync 接收范围
   - 结果：死循环仍在

### 已排除的怀疑点
- ✅ 内联函数引用不稳：useCallback 已处理
- ✅ setMeasurements 引发循环：幂等 setter 已处理
- ✅ apCropBox / latCropBox 引用每次新生成：幂等 setter 已处理
- ✅ `isHeadDualScoutFlow` / `headDualApOverride` 每次新生成：实测是 useMemo + boolean 依赖，引用稳定

### 剩余怀疑点（未验证）
- `setScoutCropBox(box)` 在 `handleApCropBoxChange` 里**没有做幂等**，每次直接 `setScoutCropBox(box)` → state 永远是新引用 → 父组件 re-render → 但子组件 props 不变，理论不应该再 fire useEffect
- `applyMeasurementsToCropBox()` 返回 `{...cropBox}` 永远新引用，即使值相同 → `setCropBox(new_ref_same_values)` 在 React 里会触发 cropBox useEffect 重 fire（因为 Object.is 比较引用）
- `TomographicScoutViewport` 内部 `onCropBoxChangeRef = useRef(onCropBoxChange)` + `useEffect(() => { onCropBoxChangeRef.current = onCropBoxChange; }, [onCropBoxChange])` 这个 sync 模式，配合不稳定的 prop 可能有副作用
- 父组件 `[apCropBox, latCropBox, scoutCropBox]` 状态之间的相互写入可能形成长链触发

### 接手者要做的诊断步骤
1. 在 `TomographicScoutViewport` 每个 useEffect 顶部加 `console.count("which-effect-name")`，加载 `/helical-confirm` 后看哪个 effect 计数飙升
2. 用 React DevTools Profiler 录一段 → 找出 Components 列表里 Render count 异常高的组件
3. 临时把 `HelicalScanConfirmScreen` 里 dual 分支两个 `TomographicScoutViewport` 改成**只渲染 1 个**（AP），看死循环还在不在 → 区分是单个 viewport 自己的循环 vs 两个 viewport 互相打架

---

## 5. 已验证的演示流程（除 helical-confirm 外）

1. 紧急登录 → 选患者 → 选头部 → 选"**头部双定位**"协议 → 下一步
2. `/scout-scan` 激光摆位（占位）→ 下一步
3. `/scan-confirm` 参数确认 → 执行扫描
4. `/scout-execute` 长按 3s 绿色按钮 → 看到：
   - **AP 视口曝光 → 渲染（左下角标"采集中"→"✓"）**
   - **右侧 LAT 视口显示"机架旋转 90°"加载动画**
   - **LAT 曝光 → 渲染**
   - 自动跳转到 `/helical-confirm`
5. `/helical-confirm` ← **目前是阻塞页面**

协议编辑（`/service/settings/protocol-management` → 选"头部双定位"）的左侧采集队列已经自动显示两条独立"定位像"条目，点哪条编辑哪条参数 —— 这是数据驱动的现有行为，未改动代码。

---

## 6. 整改方案选项

### 方案 A：换实现思路 —— 自建 `DualScoutViewport`（推荐）
不再硬塞两个 `TomographicScoutViewport` 实例做受控 sync。新建一个专门的双视角组件：
- 状态归属：**1 个共享 Z state**（y + height）+ **2 个独立 X state**（apX/Width, latX/Width），全部在 DualScoutViewport 内部
- 渲染：用 `DicomViewer`（cornerstone）+ 自己画两套 crop overlay
- pointer 事件：手写一套，统一处理 Z handles（联动）/ X handles（独立）

优点：状态归属清晰，避免"父受控 + 子内部 state"双重所有权打架。
工作量估计：~1 天。

### 方案 B：先回退 helical-confirm 双图，保留其他
把 `HelicalScanConfirmScreen.tsx` 里 dual 分支删掉（约 30 行 JSX + 父组件 state），dual 协议在 helical-confirm 上还是显示单图（用 AP）。
- 优点：整条演示链路立即可用（10 分钟）
- 缺点：helical-confirm 上无法看到 LAT 视角和 Z 联动

### 方案 C：继续在原方案上 debug
按上面 §4 的诊断步骤定位具体死循环源头，对症修。
工作量：1 小时～半天，不确定。

---

## 7. 文件清单（含改动行号位置参考）

| 文件 | 类型 | 关键改动位置 |
|---|---|---|
| `backend/main.py` | 后端 | `HEAD_DUAL_SCOUT_DEMO_DIR` 常量 + `_build_head_dual_scout_*` + `/api/demo-dicom/head-dual-scout` endpoint |
| `backend/app.db` | 数据 | protocols.id=140 "头部双定位" + 3 个 series + topogram_params 0°/90° |
| `ui-review/public/dicom/head-dual-scout/scout-ap.dcm` | 资源 | AP 定位像 |
| `ui-review/public/dicom/head-dual-scout/scout-lat.dcm` | 资源 | LAT 定位像 |
| `ui-review/src/lib/headDualScoutDemo.ts` | 前端 | 整个文件新建 |
| `ui-review/src/screens/ScoutExecuteScanScreen.tsx` | 前端 | `DualScoutPhase` 类型 + 状态 + `runRampAnimation` + `performTriggerScanDual` + dual JSX 分支 |
| `ui-review/src/screens/HelicalScanConfirmScreen.tsx` | 前端 | `useHeadDualScout*` + apCropBox/latCropBox state + useCallback 回调 + dual JSX 分支（**有 bug**） |
| `ui-review/src/screens/SequenceScanConfirmScreen.tsx` | 前端 | `TomographicScoutViewport` 新增 `cropBoxOverride` prop + sync useEffect |

---

## 8. 不要踩的坑

1. **不要给单 topogram_param 加 tube_angle_2 字段**：这样会污染数据模型且不符合"协议级两条 series"的设计。
2. **不要改 `WT32NewProtocolScoutDetailScreen.tsx`**：那是早期 175 行硬编码的静态原型页（路径 `/protocol-detail/scout`），跟真实协议编辑流程没接通。真实流程走 `ProtocolDetailLayout` → `ProtocolSidebar`，已经数据驱动支持多 topogram。
3. **不要在 headless preview / 隐藏标签里测拖拽**：`document.visibilityState === "hidden"` 时浏览器节流 RAF + pointer 事件，模拟拖拽不会生效。要验证必须在真实可见浏览器窗口里手动测。
4. **TomographicScoutViewport 的内部 cropBox state 是 self-owned 设计**，强行受控时要小心；它的 `applyMeasurementsToCropBox` 总是返回新引用（spread），会触发下游 cropBox useEffect。这点是 §4 死循环的潜在根源之一。

---

## 9. 演示用户身份

- 紧急登录（无需账号密码）即可进入演示流程
- 或正常账号：U0001（系统管理员）/ T1001（CT 技师）—— 密码不在本文档范围内

## 10. 启动命令

后端：`uvicorn backend.main:app --reload --port 8000`
前端：`cd ui-review && npm run dev`（端口 5175）

或一键：`cd ui-review && npm run dev:all`（同时起前后端）
