# 4D 工程师 IMG 数据接入说明

本文档说明如何将图像工程师提供的 4D 重建输出 `.img` 数据接入前端 4D 后处理流程，供正式环境实现参考。

## 目标链路

4D 扫描结束后，前端需要串起以下流程：

1. 重扫床位选择
2. 4D 图像加载
3. 相位数据选择
4. 图像浏览 / 4D MPR

工程师当前提供的数据可以真实支撑：

- 按床位、相位、候选数据加载
- 重复相位候选选择
- 阅片页根据候选选择加载对应体数据
- 相位筛选页显示跨床位拼接的 coronal / sagittal 视图

工程师当前提供的数据暂不支持：

- 真实的“重扫两套曝光数据”选择

原因是当前 `.img` 只有床位、相位、候选重复关系，没有明确的 acquisition attempt / rescan batch 标记。正式环境如果要真实支持重扫选择，需要重建端额外提供采集批次或重扫来源标识。

## 原始数据格式

工程师提供的文件不是标准 DICOM 文件，而是私有 `.img` 文件。文件内没有 `DICM` magic，但包含 CT stored pixel。

当前样例文件特征：

```text
文件大小 = 524869 bytes
私有头长度 = 581 bytes
像素矩阵 = 512 x 512
像素类型 = little-endian int16
像素字节数 = 512 x 512 x 2 = 524288 bytes
```

因此：

```text
524869 = 581 + 524288
```

### Header 字段

当前实现根据样例数据推断并使用以下字段：

| 偏移 | 类型 | 含义 |
| --- | --- | --- |
| 384 | uint32 little-endian | 文件序号 / sequence index |
| 390 | uint16 little-endian | volume group index |
| 470 | ascii string | acquisition time |
| 486 | float32 little-endian | phase value，例如 0.0、0.1、...、0.9 |
| 508 | float32 little-endian | z / table position 参考值 |

正式环境建议不要依赖“推断字段”长期运行。重建端最好输出正式 manifest，或者明确发布 `.img` header 协议。

## 数据组织

当前样例数据：

```text
原始 .img 数量 = 3169
床位数 = 9
相位数 = 10
volume group 数量 = 99
每组体数据层数 = 32
```

理论上 9 个床位、每床位 10 个相位，应有 90 组体数据。当前数据有 99 组，说明每个床位存在 1 个重复相位候选。

重复相位分布：

| 床位 | 重复相位 |
| --- | --- |
| 床位 01 | Phase 0% |
| 床位 02 | Phase 60% |
| 床位 03 | Phase 20% |
| 床位 04 | Phase 70% |
| 床位 05 | Phase 30% |
| 床位 06 | Phase 90% |
| 床位 07 | Phase 40% |
| 床位 08 | Phase 0% |
| 床位 09 | Phase 60% |

当前脚本按 `groupIndex // 11` 推导床位，因为样例数据中每个床位正好有 11 个 group。正式环境不要依赖这个规则，最好由后端 manifest 直接给出 `bedIndex`。

## 像素转换与窗宽窗位

`.img` 中的像素是 CT stored value。显示前需要转换到 HU：

```text
HU = storedValue - 1024
```

当前原型统一使用肺窗：

```text
Window Level = -600
Window Width = 1600
```

转 8-bit WebP 的公式：

```text
low = WL - WW / 2
high = WL + WW / 2
gray = clamp((HU - low) * 255 / (high - low), 0, 255)
```

注意事项：

- 不要对每张图做 percentile 自适应窗宽窗位，否则相位之间、床位之间亮度不可比较。
- 不要直接使用 stored value 做 `WL=-600 / WW=1600`，必须先减 `1024`。
- 如果工程师临时要求 `WL=0 / WW=500`，只改配置即可，但正式肺部检查演示建议保持肺窗。

## 转换输出

当前原型把数据转换到：

```text
ui-review/public/fourd-engineer/
```

正式环境不建议放在前端 public 目录。建议由后端转换服务输出到对象存储或影像缓存服务，再通过 manifest 返回 URL。

每个 volume group 输出：

```text
groups/gNNN/
  axial/001.webp
  axial/002.webp
  ...
  axial/032.webp
  axial-preview.webp
  coronal-strip.webp
  sagittal-strip.webp
  coronal-preview.webp
  sagittal-preview.webp
  volume.mha
```

### axial

`axial/001.webp` 到 `axial/032.webp` 用于图像加载页模拟逐张加载，也可用于轴位缩略图。

### axial-preview

取体数据中间层作为候选数据轴位预览。

### coronal-strip / sagittal-strip

这是相位筛选页的关键。

不要用单个床位的 32 层体数据直接生成一个 512x512 的 coronal / sagittal 视图。单床位局部体数据太薄，会出现竖纹或不符合临床认知的图像。

正确做法是：

1. 每个床位生成一条 native strip。
2. 相位筛选页按床位顺序把 9 条 strip 拼起来。
3. 用户选择某个床位的候选数据后，只替换该床位对应 strip。

当前 strip 生成方式：

```python
coronal_strip = volume[:, ROWS // 2, :]
sagittal_strip = volume[:, :, COLUMNS // 2]
```

其中 `volume` shape 是：

```text
[slice, row, column] = [32, 512, 512]
```

前端拼接时每个床位占一行，最终显示为跨床位的整相位 coronal / sagittal 参考图。

### coronal-preview / sagittal-preview

这是兼容旧逻辑的 fallback。正式实现如果已经支持 strip 拼接，可以不依赖这两个字段。

### volume.mha

用于阅片页 4D MPR。

当前 MHA 输出：

```text
ElementType = MET_SHORT
DimSize = 512 512 32
ElementSpacing = 0.9766 0.9766 0.6
Offset = 0 0 0
```

当前 `Offset` 统一写成 `0 0 0`，是为了适配原型里的 MHA stitcher：它要求待拼接 MHA 具有相同 dimensions、spacing、origin。

正式环境建议：

- 如果 MPR 引擎支持真实几何拼接，应使用真实 Image Position / table position。
- 如果沿用当前 stitcher，就需要保持同尺寸、同 spacing、同 origin，并由前端按床位顺序拼接。

## Manifest 数据契约

当前 manifest 示例结构：

```json
{
  "version": 1,
  "source": "backend/data/images",
  "generatedBy": "backend/scripts/import_four_d_engineer_images.py",
  "bedCount": 9,
  "phaseCount": 10,
  "phaseLabels": ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"],
  "sliceCountPerVolume": 32,
  "rescaleIntercept": -1024,
  "windowLevel": -600,
  "windowWidth": 1600,
  "rows": 512,
  "columns": 512,
  "volumes": []
}
```

每个 volume：

```ts
interface FourDEngineerVolume {
  id: string;                 // "g077"
  groupIndex: number;         // 77
  bedIndex: number;           // 0-based
  bedNumber: number;          // 1-based
  phaseIndex: number;         // 0..9
  phaseValue: number;         // 0.0..0.9
  phaseLabel: string;         // "0%"
  candidateIndex: number;     // 0-based
  sliceCount: number;         // 32
  sourceSliceCount?: number;  // 原始层数，可能为 33
  fileStart: number;
  fileEnd: number;
  rangeMm: [number, number];
  acquisitionTime: string;
  urls: {
    axialPreview: string;
    coronalPreview: string;
    sagittalPreview: string;
    coronalStrip?: string;
    sagittalStrip?: string;
    mha: string;
    axialSlices: string[];
  };
}
```

正式环境建议由后端提供：

```text
GET /api/4d/reconstructions/{reconstructionId}/manifest
```

返回 manifest，其中 URL 可以是同源 URL 或带签名的对象存储 URL。

## 前端页面逻辑

### 1. 图像加载页

入口：`/image-load`

逻辑：

1. 加载 manifest。
2. 如果 manifest 存在，用真实数据构造加载计划。
3. 如果 manifest 不存在，fallback 到旧 mock / DICOM demo 数据。
4. 加载计划按床位、相位顺序展开，并包含重复候选。
5. 当前样例总加载目标是 99，而不是 90。
6. 每个目标加载 `axialSlices`，用于模拟重建图像逐张到达。
7. 加载完成后自动进入相位筛选页。

当前原型自动跳转策略：

```text
allLoaded 后延迟约 700 ms
navigate("/phase-filter", { state })
```

按钮仍可保留作为兜底，但正式交互可以按产品要求隐藏或禁用。

### 2. 相位筛选页

入口：`/phase-filter`

逻辑：

1. 从 manifest 构造 `phaseMatrix`。
2. 只展示存在重复候选的 phase / bed。
3. 每个重复床位要求用户选择候选 1 / 候选 2。
4. 所有重复候选都选完后，才允许进入图像浏览。
5. 选择结果写入：

```ts
type PhaseSelections = Record<string, number>;
```

key 格式：

```text
`${bedIndex}-${phaseIndex}`
```

value：

```text
candidateIndex
```

示例：

```json
{
  "7-0": 1
}
```

表示床位 08、Phase 0% 使用候选 2。

#### Coronal / Sagittal 预览

相位筛选页必须显示 coronal / sagittal，因为临床更容易从这两个视角判断跨床位错位。

实现方式：

1. 当前 phase 下，每个床位取一个 volume。
2. 如果该床位已被用户选择候选，则使用用户选择的 candidate。
3. 如果未选择或非重复床位，则使用 candidate 0。
4. 按床位 01 到 09 顺序取 `coronalStrip` 拼成左侧 CORONAL。
5. 按床位 01 到 09 顺序取 `sagittalStrip` 拼成右侧 SAGITTAL。
6. 当前正在选择的床位在床位编号条上高亮。

不要做：

- 不要只显示当前床位的 coronal / sagittal。
- 不要把单床位 32 层 strip 拉伸成全屏 MPR。
- 不要退化成 AXIAL 视图，否则相位筛选需求不成立。

### 3. 图像浏览页

入口：`/image-viewer`

逻辑：

1. 接收 `phaseSelections`。
2. 对当前 phase 的每个床位，根据 `phaseSelections` 找到选中的 volume。
3. 收集 9 个 `volume.mha` URL。
4. 交给 MPR 组件按床位顺序拼接。
5. 默认窗宽窗位使用肺窗：

```text
WW = 1600
WL = -600
```

当前样例阅片页图像数：

```text
9 beds x 32 slices = 288
```

## 重扫床位选择的限制

当前工程师数据没有真实双曝光 / 重扫批次字段。因此：

- 可以保留原型中的重扫选择 UI。
- 后续加载、相位筛选、阅片可以继续沿用该模拟状态。
- 不能用当前数据真实证明“同一床位两次曝光选择”。

正式环境需要重建端提供类似字段：

```ts
interface Volume {
  bedIndex: number;
  phaseIndex: number;
  candidateIndex: number;
  acquisitionAttempt?: number;
  rescanSource?: "original" | "rescan";
}
```

有了 `acquisitionAttempt` 或 `rescanSource` 后，重扫床位选择才能真实驱动后续数据选择。

## 边界与坑点

### `.img` 不要直接当 DICOM

当前 `.img` 不是标准 DICOM，不能直接走 `wadouri:` DICOM loader。必须先转成前端可读的 preview 和 MHA，或者正式环境由后端转为标准 DICOM / DICOMweb。

### 必须固定窗宽窗位

相位筛选是比较任务，不是单图浏览。必须固定窗宽窗位，否则候选之间亮度不可比。

### 33 层 volume 要归一化

当前样例最后一个 group 有 33 层。原型统一取前 32 层：

```python
records[:32]
```

原因是 MHA stitcher 要求所有 volume 维度一致。正式环境也应保证同一 reconstruction set 内层数一致，或者 MPR 引擎能处理不等层数。

### Coronal / sagittal 必须跨床位

单床位的 `volume[:, center, :]` 或 `volume[:, :, center]` 会得到很薄的条纹视图。相位筛选页需要拼接所有床位，才能形成可判断错位的整相位视图。

### 不要提交原始影像和生成资产

当前仓库已忽略：

```text
*.img
*.mha
backend/data/images/
ui-review/public/fourd-engineer/
```

正式环境应把原始影像和转换产物放入影像存储或对象存储，不进入前端代码仓库。

## 验证清单

### 数据验证

- manifest 可访问。
- `bedCount = 9`
- `phaseCount = 10`
- `volumes.length = 99`
- 所有 `sliceCount = 32`
- `windowLevel = -600`
- `windowWidth = 1600`
- 每个 volume 都有 `coronalStrip` 和 `sagittalStrip`

### 图像加载页

- 加载总目标是 99。
- 每个 phase 的进度能按候选数量推进。
- 加载完成后自动跳转相位筛选。

### 相位筛选页

- 只展示有重复候选的 phase。
- 每个重复床位必须选择候选。
- 右侧仍是 CORONAL / SAGITTAL。
- 选择候选后，对应床位条带应变化。
- 当前床位编号高亮。
- 全部选择后允许进入图像浏览。

### 图像浏览页

- 进入 4D reconstruction series。
- 图像数为 288。
- MPR 可加载。
- 切换 phase 时使用对应 phase 的 9 个床位 volume。
- 对重复床位使用相位筛选页选定候选。

## 正式环境推荐架构

推荐后端流程：

1. 重建完成后，重建服务输出 `.img` 或标准 DICOM。
2. 影像处理服务解析 `.img`。
3. 生成：
   - axial preview slices
   - axial preview
   - coronal / sagittal strips
   - MHA 或 DICOMweb volume
   - manifest
4. 上传到影像缓存或对象存储。
5. 前端通过 reconstructionId 获取 manifest。
6. 前端按 manifest 驱动图像加载、相位筛选、阅片。

正式前端不应关心 `.img` header 细节。前端只依赖 manifest。