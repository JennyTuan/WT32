# 4D 图像浏览 — 真实分相数据接入计划

> 目标：把 TCIA 4D-Lung 数据集预处理成轻量 WebP，替换当前 ViewScreen 里的静态单相位 DICOM，让底部 0%-90% 相位滑块能真实切换图像，支持 MPR 三视图 + 跨相位 MIP (ITV) 演示。
>
> 本文档是**交接文档**，任何 AI 接手都应该能按步骤继续。当前状态见下方「进度追踪」。

---

## 背景上下文

- **项目根**：`C:\CT-Prototype-backup\CT-Prototype`
- **前端**：`ui-review/`（Vite + React + TypeScript + Cornerstone.js）
- **当前状况**：图像浏览页（`/image-viewer`）用常规胸部 CT（QIN-LUNG-01-0007，930MB DICOM），**无分相**，导致底部相位滑块无真实内容可切换。
- **4D 数据源**：[RadiotherapyAI/data-tcia-4d-lung-part-1](https://github.com/RadiotherapyAI/data-tcia-4d-lung-part-1)，用户已下载到本地 `D:\data-tcia-4d-lung-part-1-main`
- **数据结构**：
  ```
  D:\data-tcia-4d-lung-part-1-main\
    100_HM10395\
      07-02-2003-NA-p4-14571\                 ← 一次检查
        1.000000-P4P100S300I00003 Gated 0.0A-29193\    (142 dcm, phase 0%)
        1.000000-P4P100S300I00003 Gated 0.0A-423.1\    (重复序列，忽略)
        1.000000-P4P100S300I00004 Gated 10.0A-82400\   (phase 10%)
        ...
        1.000000-P4P100S300I00012 Gated 90.0A-70956\   (phase 90%)
  ```
  每相位约 142 张 512×512 DICOM，共 10 个相位。

---

## 关键决策（已定）

| 项 | 决策 | 理由 |
|----|------|------|
| 使用 case | `100_HM10395/07-02-2003-NA-p4-14571` 第一套（非 `-423.x` 后缀的那套） | 第一个 case 第一次检查；每相位选一套即可 |
| 分辨率 | **384×384 WebP，quality 82**（MIP 视图保持 512） | viewer 每格约 350-400px 显示，384 够用，体积 ~100MB |
| 数据源 | 用本地 `D:\data-tcia-4d-lung-part-1-main`，不 clone git | 已下载好；原 DICOM 不入 git，只有预处理产物入 git |
| 产物位置 | `ui-review/public/dicom-4d/` | Vite 会直接作为静态资源 serve |
| 预处理语言 | Python（pydicom + numpy + pillow + scipy） | 医学图像标准工具链 |

---

## 产物结构（目标）

```
ui-review/public/dicom-4d/
  manifest.json                # 元数据：相位数、每视图层数、WW/WL 默认值等
  phase-0/
    axial/001.webp ... 142.webp
    coronal/001.webp ... 256.webp     # MPR 重建
    sagittal/001.webp ... 256.webp    # MPR 重建
  phase-1/ ... phase-9/
  mip-itv/                      # 跨相位 MIP（ITV 可视化）
    axial.webp
    coronal.webp
    sagittal.webp
```

`manifest.json` 示例：
```json
{
  "case": "100_HM10395",
  "study": "07-02-2003-NA-p4-14571",
  "phases": 10,
  "views": {
    "axial": { "slices": 142, "width": 384, "height": 384 },
    "coronal": { "slices": 256, "width": 384, "height": 384 },
    "sagittal": { "slices": 256, "width": 384, "height": 384 }
  },
  "defaults": { "ww": 1500, "wl": -600 },
  "spacing": { "x": 0.97, "y": 0.97, "z": 3.0 }
}
```

---

## 执行步骤

### 阶段 1：Python 预处理脚本 ⏸️ 未开始

#### 1.1 创建脚本 `ui-review/scripts/preprocess_4d.py`

**输入**：`D:\data-tcia-4d-lung-part-1-main\100_HM10395\07-02-2003-NA-p4-14571`
**输出**：`C:\CT-Prototype-backup\CT-Prototype\ui-review\public\dicom-4d\`

**逻辑**：
1. 遍历 10 个 `Gated X.XA-<suffix>` 文件夹，按相位排序（0.0A, 10.0A, ... 90.0A）
2. 每个相位选 **非 `-423.x` 后缀** 的那套
3. 读取该相位下所有 DICOM（pydicom），按 `InstanceNumber` 或文件名排序，堆叠成 3D volume `[Z, Y, X]`
4. 应用 DICOM 的 RescaleSlope/Intercept 得到 HU 值
5. 肺窗（WW=1500, WL=-600）归一化到 [0, 255]
6. 对每个相位：
   - axial：直接取每层 `vol[z, :, :]` → resize 到 384×384 → 保存 WebP
   - coronal：`vol[:, y, :]` → 可能需要按 z 间距（~3mm）vs x 间距（~0.97mm）做纵向插值补正比例 → resize 384×384 → WebP
   - sagittal：`vol[:, :, x]` → 同上
7. MIP 生成：把 10 个相位的 volume 堆叠成 4D `[P, Z, Y, X]`，沿 P 轴取 max，再分别生成 axial/coronal/sagittal MIP（选中间层或压缩一整个维度）
8. 写 `manifest.json`

**依赖安装**（用户跑）：
```bash
pip install pydicom numpy pillow scipy
```

**运行命令**：
```bash
cd C:\CT-Prototype-backup\CT-Prototype
python ui-review/scripts/preprocess_4d.py --input "D:\data-tcia-4d-lung-part-1-main\100_HM10395\07-02-2003-NA-p4-14571" --output ui-review/public/dicom-4d
```

#### 1.2 验证产物
- 体积应在 80-150MB 之间
- 抽检几张 WebP，肉眼看能分辨胸部结构、肺窗对比度正常
- `manifest.json` 字段齐全

---

### 阶段 2：前端接入 ⏸️ 未开始

#### 2.1 新增 4D 图像加载逻辑

**文件**：`ui-review/src/lib/fourDImageSource.ts`（新建）

导出：
- `FOUR_D_MANIFEST`: 从 `/dicom-4d/manifest.json` 加载（或编译时内联）
- `getFourDImageUrl(phase: number, view: "axial"|"coronal"|"sagittal", slice: number): string`
- `getFourDMipUrl(view: "axial"|"coronal"|"sagittal"): string`
- `preloadPhaseImages(phase: number, view: "axial")`：挂载时并行预热 `new Image().src = url`

#### 2.2 改造 `ViewScreen.tsx`

关键位点（[ViewScreen.tsx](../ui-review/src/screens/ViewScreen.tsx)）：
- **第 197-201 行** `REAL_LUNG_SERIES` / `getSeriesDicomUrl`：4D 入口时改用 4D 数据源
- **第 257 行** `selectedPhaseIndex`：已存在，保持
- **第 588-591 行** `seriesImageUrls` useMemo：依赖列表加 `selectedPhaseIndex`，4D 模式下调 `getFourDImageUrl(selectedPhaseIndex, view, slice)`
- **MIP 面板**（第 1189 行附近 `phaseMipMode`）：4D 模式下切成加载 `getFourDMipUrl(view)`

#### 2.3 DicomViewer 兼容普通图像

**文件**：[DicomViewer.tsx](../ui-review/src/components/DicomViewer.tsx) / [CornerstoneStackViewport.tsx](../ui-review/src/components/CornerstoneStackViewport.tsx)

方案二选一：
- **A（推荐）**：新建 `WebImageViewer.tsx`，用 `<canvas>` 或 `<img>` 渲染 WebP，保留工具栏（pan/缩放/WL）的基础交互。4D 入口用它，非 4D 仍用 DicomViewer。
- **B**：给 Cornerstone 塞 web image loader（`cornerstone-web-image-loader`），用 `webimage://xxx.webp` 协议加载 —— 这样所有工具复用，但多一层依赖。

判断：方案 A 简单，demo 够用；方案 B 一致性好但实现成本高。**默认选 A**。

#### 2.4 预加载策略
- `ViewScreen` 挂载且 `isFourDEntry=true` 时，`useEffect` 里 for phase in 0..9: preload axial 中间层 1 张（保证切相位首帧瞬时出）
- 用户拖 slice 滑块时，当前相位 axial 全量预热
- coronal/sagittal 懒加载（切到那个视图时预热）

---

### 阶段 3：验证 ⏸️ 未开始

1. `npm run dev`（在 `ui-review/` 下），进入 `/image-viewer` 4D 流程
2. 用 Claude Preview 工具截图检查：
   - 4 个视口都显示 4D 数据（不再是旧胸部 CT）
   - 点击底部 0%/10%/.../90% 按钮，图像确实变化
   - 第 4 个 MIP 视口显示跨相位 MIP
   - 相位 cine 播放流畅（切换 < 100ms/帧）
3. DevTools Network 面板确认 WebP 缓存命中（第二次切相位 status=200 from disk cache）

---

### 阶段 4：清理 ⏸️ 未开始

- `.gitignore` 不要排除 `public/dicom-4d/`（这是产物，要进 git）
- 更新 `ui-review/README.md` 说明 4D 数据来源和重新生成命令
- 原 DICOM（`public/dicom/QIN LUNG CT`）是否保留？→ 保留，非 4D 流程还用

---

## 进度追踪

- [x] 阶段 1.1：写 `preprocess_4d.py` ✅
- [x] 阶段 1.2：用户运行脚本，验证产物 ✅（2026-04-20，产物 57.8MB，10 相位全齐）
- [x] 阶段 2.1：`fourDImageSource.ts` ✅
- [x] 阶段 2.2：改 `ViewScreen.tsx` ✅（4D 分支走 FourDMprGrid，非 4D 仍走 CornerstoneMPRViewport）
- [x] 阶段 2.3：`WebImageViewer.tsx` + `FourDMprGrid.tsx` ✅（方案 A，canvas/img 渲染）
- [x] 阶段 2.4：预加载 ✅（manifest 加载后预热 10 个相位的 axial 中间层）
- [x] 阶段 3：浏览器端验证 ✅（2026-04-20，用户反馈"性能挺好"）
- [x] 阶段 4：文档和清理 ✅（2026-04-20，已确认 `.gitignore` 且补充 `ui-review/README.md`）

### 阶段 2 实际改动清单

新增：
- `ui-review/src/lib/fourDImageSource.ts` — manifest 加载 + URL 生成 + 预加载 helper
- `ui-review/src/components/WebImageViewer.tsx` — WebP 栈渲染，API 兼容 `DicomViewerHandle`
- `ui-review/src/components/FourDMprGrid.tsx` — 2×2 MPR 四分屏（axial/coronal/sagittal/MIP）

修改：
- `ui-review/src/screens/ViewScreen.tsx`：
  - 新增 import：`FourDMprGrid`、`loadFourDManifest`、`preloadPhaseFirstFrames`、`FourDManifest`
  - 新增 state：`fourDManifest`、`fourDManifestError`、`fourDGridRef`
  - 新增 useEffect：`isFourDLungReconSeries` 时加载 manifest → 设置肺窗默认值 → 预热 10 相位中间层
  - 3D 分支 render：`isFourDLungReconSeries && fourDManifest` → `FourDMprGrid`；加载中/失败显示占位；否则走原 `CornerstoneMPRViewport`

非 4D 流程（普通 DICOM 浏览）完全未动。

## 阶段 4 完成记录（2026-04-20）

1. **`.gitignore` 已确认**：项目根 `.gitignore` 与 `ui-review/.gitignore` 均未排除 `ui-review/public/dicom-4d/`，产物可正常入库。
2. **`ui-review/README.md` 已补充**：
   - 数据集链接：https://github.com/RadiotherapyAI/data-tcia-4d-lung-part-1
   - 预处理命令：`python ui-review/scripts/preprocess_4d.py --input <...> --output ui-review/public/dicom-4d`
   - 依赖：`pip install pydicom numpy pillow scipy`
3. **旧数据保留策略已明确**：
   - 旧数据 `ui-review/public/dicom/QIN LUNG CT`（930MB）继续保留，供非 4D 流程使用。
   - README 已注明 `--input` 为本机路径，需按环境替换。
4. **可选增强**（若时间有）：
   - MIP 面板目前只预渲染了 MIP 模式（未生成 MinIP/Avg）。切换模式时 UI 会显示标签变化但图不变。要想真的支持需扩展 `preprocess_4d.py` 多算两种聚合 + 产物 `mip-itv/min/`、`mip-itv/avg/`，前端按 `phaseMipMode` 选对应路径。
   - WL 调节是 CSS filter 近似（非放射级精确）。如果需要更精确，改成在 preprocess 时保存 16-bit PNG 或原始 HU volume（体积会大 4-8 倍），前端 canvas pixel-manipulation 做真实 windowing。

## 给接手 AI 的提示（阶段 4）

- 此文档的"进度追踪"已反映截至阶段 4 的状态。
- 阶段 4 已完成；后续改动可聚焦可选增强，不影响当前演示路径。
- 若要做"可选增强"，先看 `preprocess_4d.py` 里的 `mip_vol = stacked.max(axis=0)`，仿写 `min` / `mean` 即可；前端在 `FourDMprGrid.tsx` 里把 `buildFourDMipUrls(manifest, "coronal")` 换成按 `mipMode` 查路径。

### 阶段 1 产物摘要（供阶段 2 参考）

- 产物路径：`ui-review/public/dicom-4d/`
- 体积：57.8 MB（含 MIP），12827 个文件
- manifest：
  - 10 相位（0% ~ 90%）
  - views: axial=142 张 / coronal=512 张 / sagittal=512 张（均 384×384 WebP）
  - mip-itv: axial=142 / coronal=512 / sagittal=512（均 512×512 WebP，跨相位 MIP）
  - defaults: ww=1500, wl=-600（肺窗）
  - spacing: x=y=0.9766mm, z=3.0mm
- URL 形如：`/dicom-4d/phase-3/axial/071.webp`, `/dicom-4d/mip-itv/coronal/256.webp`

## 给接手 AI 的提示

1. **先读这份文档和 [ViewScreen.tsx](../ui-review/src/screens/ViewScreen.tsx)** 再动手。
2. **不要**改非 4D 流程的 DICOM 加载逻辑（`REAL_LUNG_SERIES`），只在 `isFourDEntry` 分支切换数据源。
3. 用户的 Python 环境在 Windows，脚本里路径用 `pathlib.Path`，不要写死 `/` 或 `\`。
4. 预处理脚本要**幂等**：重复运行只覆盖产物，不报错。
5. 如果 MPR 重建（coronal/sagittal）比例不对，检查 DICOM 的 `PixelSpacing` 和 `SliceThickness`——z 方向约 3mm，xy 方向约 0.97mm，需要按比例缩放 z 轴。
