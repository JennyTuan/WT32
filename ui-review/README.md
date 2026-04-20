# ui-review 前端说明

## 4D 图像数据来源（4D-Lung）

`/image-viewer` 的 4D 演示数据来自 TCIA 4D-Lung：

- 数据集仓库：<https://github.com/RadiotherapyAI/data-tcia-4d-lung-part-1>
- 原始 DICOM：请在本地准备（不要提交到 git）
- 预处理产物目录：`ui-review/public/dicom-4d/`（需要提交到 git）

## 4D 预处理脚本

脚本位置：`ui-review/scripts/preprocess_4d.py`

安装依赖：

```bash
pip install pydicom numpy pillow scipy
```

运行命令（示例）：

```bash
python ui-review/scripts/preprocess_4d.py --input "D:\\data-tcia-4d-lung-part-1-main\\100_HM10395\\07-02-2003-NA-p4-14571" --output ui-review/public/dicom-4d
```

> 提示：`--input` 路径应替换为你本机的数据目录，脚本支持重复执行并覆盖产物。

## 旧数据说明

`ui-review/public/dicom/QIN LUNG CT` 目前仍被非 4D 浏览流程使用，请保留。
