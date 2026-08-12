# Alibaba DSW 部署：pulmonary-ai 原型服务

此包仅用于 WT32 的脱敏样本原型验证，不是临床部署、诊断工具或设备控制软件。`lung_nodules` 产物只能显示为 AI 初步分割，仍需医生确认；不得用于真实患者数据、诊断结论、风险分级或正式报告。

DSW 可能不提供 Docker 权限，因此本流程不执行 `docker build` 或 `docker run`；使用 Python venv 和 Uvicorn。保留的 `Dockerfile` 仅供另有 Docker 环境时参考。

## 默认安全状态

复制示例配置后，`PULMONARY_AI_ENABLE_INFERENCE=0`。服务可以启动并通过健康检查，但提交任务会明确返回 HTTP 503，且启动器清空 `CUDA_VISIBLE_DEVICES`，不会静默发起 GPU 推理。

`lung_nodules` 任务目前保持阻断。未来若团队考虑变更，必须先在团队记录中完成以下内容：

- DSW 实例的 GPU/CUDA 与 PyTorch 可用；
- 当前 `TotalSegmentator` 的 `lung_nodules` task 及其权重许可已逐项确认；
- 在授权的脱敏样本上完成空间对齐、失败模式和医生复核验证。

这三项不是脚本能够代替的审批。当前不应修改 `PULMONARY_AI_ENABLE_INFERENCE=0`，也不应提交任何模型作业。

## 一次启动清单

以下命令假定仓库已在 DSW 工作空间。它们只安装既有依赖、启动禁用推理的服务和检查健康状态；不会提交模型推理。数据目录必须是 DSW 中受控、可写的位置。不要把 DICOM、模型输出、`.env` 或凭据提交到 Git。

```bash
cd /mnt/workspace/WT32/services/pulmonary-ai
install -m 600 dsw.env.example .env
mkdir -p /mnt/workspace/pulmonary-ai-data
# 在本地终端生成一次随机值，复制后粘贴到下一条隐藏输入提示；不要保存到日志或历史记录。
python -c "import secrets; print(secrets.token_urlsafe(32))"
read -rsp 'PULMONARY_AI_API_KEY: ' wt32_dsw_key; printf '\n'
sed -i "s|^PULMONARY_AI_API_KEY=.*|PULMONARY_AI_API_KEY=${wt32_dsw_key}|" .env
unset wt32_dsw_key
python deploy_dsw.py bootstrap
python deploy_dsw.py preflight
python deploy_dsw.py start
```

上面的 `read` 不回显令牌；`sed` 只把它写入权限为 `600` 的 `.env`。`start` 明确使用 `.env` 中的 `PULMONARY_AI_BIND_HOST` 和 `PULMONARY_AI_PORT`。默认 `127.0.0.1:8020` 只允许同一 DSW 实例访问。若 WT32 后端需要跨容器访问，先由平台网络策略和认证边界确认，再有意地更改绑定地址；不要直接公开到互联网。

除 `/health` 外，所有作业、状态与产物接口都要求 `Authorization: Bearer <PULMONARY_AI_API_KEY>`。服务启动时也会拒绝空令牌配置。令牌只保存在 DSW 服务和 WT32 后端的环境配置中，不进入浏览器、提交记录或日志。

在另一个 DSW 终端中，只检查服务存活（不会提交推理）：

```bash
cd /mnt/workspace/WT32/services/pulmonary-ai
python deploy_dsw.py health --url http://127.0.0.1:8020/health
```

预期默认响应包含：

```json
{"ok": true, "inference_enabled": false}
```

## Five-lobe GPU smoke test

This is the only permitted first GPU run. It creates a real five-lobe DICOM
SEG and a real five-lobe PLY surface from the de-identified sample, but it
does **not** run `lung_nodules`, report a nodule, or create a clinical result.
Before this step, use the updated `wt32-pulmonary-ai-dsw-lobe-preview.zip`
bundle and keep `PULMONARY_AI_RUN_NODULES=0` in `.env`.

Before submitting the first GPU or offline package job, prepare the model
weights separately:

```bash
cd /mnt/workspace/WT32/services/pulmonary-ai
python deploy_dsw.py prepare-weights
```

The helper stores weights under `${PULMONARY_AI_DATA_DIR}/.totalsegmentator`
instead of a transient home directory. If DSW keeps breaking the model download,
copy a completed `.totalsegmentator` directory from a stable-network machine
into that data directory, then rerun `prepare-weights` to verify it.

Only after the service and test input are prepared, and after the user has
explicitly approved the paid GPU run, change `PULMONARY_AI_ENABLE_INFERENCE`
from `0` to `1`, run `python deploy_dsw.py preflight`, and submit exactly one
de-identified sample job. Once the artifacts are persisted, stop the DSW
instance immediately.

## 一次停止清单

服务以前台方式运行。回到执行 `python deploy_dsw.py start` 的 DSW 终端，按 `Ctrl-C` 即可停止 Uvicorn。保持 `.env` 中 `PULMONARY_AI_ENABLE_INFERENCE=0` 不变；下次启动仍只提供健康检查，作业提交会明确失败且不会伪造分割结果。
