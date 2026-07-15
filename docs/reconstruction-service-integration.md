# WT32 离线重建服务与引擎接入说明

## 1. 文档目的

本文说明 WT32 的离线重建任务架构、接口契约、状态机、前后端职责、真实重建引擎接入点及验证方法，供后续修改、联调和故障定位使用。

当前实现完成的是厂商无关的任务编排和新序列接入链路，不包含 CT 原始投影重建或金属伪影校正算法。未配置真实引擎时，服务会明确返回“重建引擎未配置”，不会复制原图并冒充重建结果。

## 2. 系统边界

WT32 是产品和 UI 验证用控制台，不是临床软件。当前重建服务不得用于真实设备控制、诊断结论、治疗建议或最终图像质量保证。

各组件职责如下：

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| `ui-review` | 参数编辑、提交任务、显示进度、加载并选中新序列 | CT 重建算法、MAR 算法 |
| `backend` | 认证边界内的 API 网关、错误透传 | 图像像素计算 |
| `reconstruction-service` | 任务持久化、状态机、Provider 调用、输出序列契约 | 默认不包含厂商算法 |
| Provider | 适配厂商 SDK、HTTP 服务或命令行程序 | WT32 页面状态 |
| Cornerstone3D | 加载和显示 Provider 输出的 DICOM | 原始投影重建 |

如果 Provider 只有现有 DICOM 输入并执行图像域处理，应在技术文档和审计信息中准确描述为“图像后处理”，不能当作原始数据重建。

## 3. 目录结构

```text
reconstruction-service/
  pyproject.toml
  src/reconstruction_service/
    main.py          FastAPI 接口与任务状态同步
    schemas.py       稳定的请求、任务和输出序列契约
    providers.py     Provider 接口、动态加载和未配置实现
    store.py         SQLite 任务持久化
  tests/test_api.py  状态机与输出序列测试

backend/routers/reconstruction.py
  WT32 后端到独立服务的网关

ui-review/src/lib/reconstructionApi.ts
  前端任务 API、轮询和错误解析

ui-review/src/screens/ViewScreen.tsx
  参数提交、进度显示、新序列注册和自动选中
```

## 4. 运行方式

首次安装独立服务：

```powershell
cd C:\STN\projects\WT32\reconstruction-service
..\.venv\Scripts\python.exe -m pip install -e .
```

启动三个进程：

```powershell
# 1. 独立重建服务
cd C:\STN\projects\WT32\reconstruction-service
..\.venv\Scripts\python.exe -m uvicorn reconstruction_service.main:app --reload --port 8010

# 2. WT32 后端
cd C:\STN\projects\WT32
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000

# 3. WT32 前端
cd C:\STN\projects\WT32\ui-review
npm.cmd run dev
```

默认情况下独立服务可以启动，但 Provider 为 `unconfigured`。此时能力查询正常，任务提交返回 `RECONSTRUCTION_ENGINE_NOT_CONFIGURED`。

## 5. 正常工作流

```text
勾选去金属伪影及其他参数
  → 点击“重新重建”
  → WT32 POST /api/reconstruction/jobs
  → 后端网关转发到 reconstruction-service
  → reconstruction-service 调用 Provider.submit
  → 前端轮询任务状态和进度
  → Provider 返回 completed + output_series
  → 新序列加入原扫描分组
  → 自动切换到 2D 并选中新序列
  → Cornerstone 加载 output_series.image_urls
```

页面重新进入时，前端按扫描会话查询已完成任务，并恢复其输出序列。任务记录保存在 `reconstruction-service/data/reconstruction_jobs.db`。

## 6. 状态机

| 状态 | 含义 | 可转移到 |
| --- | --- | --- |
| `queued` | Provider 已接收，等待计算资源 | `running`、`failed`、`cancelled` |
| `running` | 正在执行重建 | `completed`、`failed`、`cancelled` |
| `completed` | Provider 已返回完整、可访问的新序列 | 终态 |
| `failed` | 参数、引擎、数据或输出验证失败 | 终态；重新提交会生成新任务 |
| `cancelled` | 已取消 | 终态 |

只有同时满足以下条件，页面才显示“重建完成”：

- 任务状态为 `completed`；
- `output_series` 存在；
- `image_urls` 至少包含一个图像地址；
- `image_count` 为正数。

## 7. API 契约

### 7.1 能力查询

```http
GET /api/v1/reconstruction/capabilities
```

示例：

```json
{
  "service_ready": true,
  "provider_name": "vendor-a",
  "supported_matrices": [512, 1024],
  "supports_metal_artifact_reduction": true
}
```

### 7.2 创建任务

```http
POST /api/v1/reconstruction/jobs
```

```json
{
  "scan_session_id": 12,
  "source_series": {
    "series_id": "sess12-ser4-recon8",
    "series_instance_uid": null,
    "raw_data_reference": null,
    "image_urls": ["/dicom/source/image-001.dcm"]
  },
  "parameters": {
    "slice_thickness": 1.0,
    "slice_spacing": 0.8,
    "kernel": "FC21",
    "fov": 240.0,
    "center_x": 0,
    "center_y": 0,
    "z_start": null,
    "z_end": null,
    "matrix": 512,
    "metal_artifact_reduction": true,
    "reconstruction_mode": null,
    "window_width": 100,
    "window_level": 35
  },
  "requested_series_description": "Brain MAR"
}
```

`image_urls` 是当前查看序列的引用，便于后处理型 Provider 使用；原始数据重建 Provider 应使用 `raw_data_reference` 或将其映射为厂商能够识别的数据 ID。Provider 必须自行拒绝不满足算法输入要求的请求。

### 7.3 查询任务

```http
GET /api/v1/reconstruction/jobs/{job_id}
GET /api/v1/reconstruction/jobs?scan_session_id=12
```

完成结果：

```json
{
  "job_id": "recon-...",
  "status": "completed",
  "progress": 100,
  "output_series": {
    "series_id": "derived-mar-001",
    "series_instance_uid": "1.2.840....",
    "series_description": "Brain MAR",
    "image_urls": [
      "/dicom-derived/derived-mar-001/image-001.dcm"
    ],
    "image_count": 1,
    "kernel": "FC21",
    "slice_thickness": 1.0,
    "slice_spacing": 0.8,
    "fov": 240.0,
    "matrix": 512,
    "window_width": 100,
    "window_level": 35,
    "metal_artifact_reduction": true
  }
}
```

### 7.4 取消任务

```http
DELETE /api/v1/reconstruction/jobs/{job_id}
```

当前页面尚未提供取消按钮，但服务和网关已保留取消接口。

## 8. Provider 接入

Provider 必须实现 `reconstruction_service.providers.ReconstructionProvider` 的四个方法：

```python
class VendorProvider:
    def capabilities(self): ...
    def submit(self, request): ...
    def get_status(self, provider_job_id): ...
    def cancel(self, provider_job_id): ...

def create_provider():
    return VendorProvider()
```

确保 Provider 模块可被 Python 导入，然后设置：

```powershell
$env:WT32_RECONSTRUCTION_PROVIDER = "vendor_provider:create_provider"
```

Provider 需要负责：

1. 将稳定契约映射到厂商字段；
2. 判断原始数据、几何和校准信息是否齐全；
3. 将厂商状态映射到 WT32 五种状态；
4. 将输出 DICOM 放到 WT32/浏览器可访问的位置；
5. 返回准确的 `image_urls`、图像数和显示默认值；
6. 把厂商错误映射为稳定错误码和专业中文信息；
7. 不得在未产生有效输出时返回 `completed`。

## 9. 配置项

| 环境变量 | 所属进程 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `WT32_RECONSTRUCTION_PROVIDER` | 重建服务 | 空 | `module:factory` Provider 加载入口 |
| `WT32_RECONSTRUCTION_DB` | 重建服务 | `data/reconstruction_jobs.db` | 任务数据库路径 |
| `WT32_RECONSTRUCTION_SERVICE_URL` | WT32 后端 | `http://127.0.0.1:8010` | 独立服务地址 |
| `WT32_RECONSTRUCTION_SERVICE_TIMEOUT_SECONDS` | WT32 后端 | `5` | 单次网关请求超时 |

## 10. 稳定错误码

| 错误码 | 含义 | 建议处理 |
| --- | --- | --- |
| `RECONSTRUCTION_ENGINE_NOT_CONFIGURED` | 独立服务已启动但无 Provider | 配置 Provider 后重试 |
| `RECONSTRUCTION_SERVICE_UNAVAILABLE` | WT32 后端无法连接独立服务 | 检查 8010 服务、地址和防火墙 |
| `RECONSTRUCTION_JOB_NOT_FOUND` | 任务不存在或数据库不一致 | 刷新任务历史，必要时重新提交 |
| `RECONSTRUCTION_REQUEST_FAILED` | 前端无法解析的通用请求失败 | 查看后端和服务日志 |

厂商 Provider 应在此表继续登记新的稳定错误码，避免前端直接依赖厂商原始错误文字。

## 11. 后续修改建议

- 增加取消按钮时直接调用现有 `DELETE` 接口，不要在前端自行修改终态。
- 需要任务并发限制时，应在 Provider 或服务端队列实现，不要靠禁用单个页面按钮实现。
- 需要跨设备部署时，将 SQLite 替换为共享数据库；保持 `ReconstructionJobStore` 方法语义不变。
- 需要 WebSocket/SSE 进度时，可替换前端轮询，但保留 GET 查询作为恢复和容错入口。
- 新增参数时先扩展 `schemas.py`，再同步 Provider、前端类型和本文接口示例。
- 新序列若要正式写入扫描会话数据库，应增加独立的“派生图像序列”模型，不要修改协议模板中的 `recon_series`。
- DICOM 输出需补充 Series Instance UID、派生关系和算法标识等元数据时，应由 Provider 或专门的 DICOM 输出模块统一负责。

## 12. 验证命令

```powershell
# 独立服务状态机
$env:PYTHONPATH = "reconstruction-service/src"
.\.venv\Scripts\python.exe -m unittest discover -s reconstruction-service\tests -v

# WT32 后端（含重建网关）
.\.venv\Scripts\python.exe -m unittest discover -s backend\tests

# 前端
cd ui-review
npm.cmd run lint
npm.cmd run build
```

联调时至少验证：未配置引擎、服务不可达、排队、运行、完成无输出、完成有输出、失败、取消、页面重新进入恢复序列，以及输出 DICOM 无法访问等场景。
