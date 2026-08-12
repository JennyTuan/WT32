"""Alibaba DSW helper: install, preflight, start, and health-check pulmonary-ai.

This script intentionally does not submit an inference job.  The service keeps
inference disabled unless its local .env explicitly enables it.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


SERVICE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SERVICE_DIR / ".env"
VENV_PYTHON = SERVICE_DIR / ".venv" / "bin" / "python"
REQUIRED_SETTINGS = (
    "PULMONARY_AI_BIND_HOST",
    "PULMONARY_AI_PORT",
    "PULMONARY_AI_DATA_DIR",
    "PULMONARY_AI_API_KEY",
    "PULMONARY_AI_ENABLE_INFERENCE",
    "PULMONARY_AI_RUN_NODULES",
    "PULMONARY_AI_LUNG_NODULES_LICENSE_REVIEWED",
    "PULMONARY_AI_LUNG_NODULES_VALIDATION_RECORDED",
)
WEIGHT_DOWNLOAD_ATTEMPTS = 3


def load_settings() -> dict[str, str]:
    if not CONFIG_PATH.is_file():
        raise SystemExit(f"缺少 {CONFIG_PATH}；请从 dsw.env.example 复制创建。")
    settings: dict[str, str] = {}
    for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not key or not value:
            raise SystemExit(f"配置格式错误：{line!r}")
        settings[key] = value
    missing = [key for key in REQUIRED_SETTINGS if not settings.get(key)]
    if missing:
        raise SystemExit(f"缺少必填配置：{', '.join(missing)}")
    if settings["PULMONARY_AI_API_KEY"].startswith("CHANGE_ME_"):
        raise SystemExit("请将 PULMONARY_AI_API_KEY 替换为本地生成的随机值。")
    if settings["PULMONARY_AI_ENABLE_INFERENCE"] not in {"0", "1"}:
        raise SystemExit("PULMONARY_AI_ENABLE_INFERENCE 必须为 0 或 1。")
    if settings["PULMONARY_AI_RUN_NODULES"] not in {"0", "1"}:
        raise SystemExit("PULMONARY_AI_RUN_NODULES must be 0 or 1")
    try:
        port = int(settings["PULMONARY_AI_PORT"])
    except ValueError as exc:
        raise SystemExit("PULMONARY_AI_PORT 必须为有效端口号。") from exc
    if not 1 <= port <= 65535:
        raise SystemExit("PULMONARY_AI_PORT 必须在 1 到 65535 之间。")
    return settings


def require_venv() -> None:
    if not VENV_PYTHON.is_file():
        raise SystemExit("未找到 .venv；请先运行：python deploy_dsw.py bootstrap")


def inference_enabled(settings: dict[str, str]) -> bool:
    return settings["PULMONARY_AI_ENABLE_INFERENCE"] == "1"


def runtime_environment(settings: dict[str, str]) -> dict[str, str]:
    environment = os.environ | settings
    data_dir = Path(settings["PULMONARY_AI_DATA_DIR"])
    data_dir.mkdir(parents=True, exist_ok=True)
    weight_home = data_dir / ".totalsegmentator"
    weight_home.mkdir(parents=True, exist_ok=True)
    environment.setdefault("TOTALSEG_HOME_DIR", str(weight_home))
    return environment


def _missing_inference_acknowledgements(settings: dict[str, str]) -> list[str]:
    acknowledgements = (
        "PULMONARY_AI_LUNG_NODULES_LICENSE_REVIEWED",
        "PULMONARY_AI_LUNG_NODULES_VALIDATION_RECORDED",
    )
    return [key for key in acknowledgements if settings[key].lower() != "yes"]


def require_gpu_preflight(settings: dict[str, str]) -> None:
    if not inference_enabled(settings):
        print("推理保持禁用：跳过 GPU 与 lung_nodules 检查。")
        return
    not_recorded = _missing_inference_acknowledgements(settings)
    if settings["PULMONARY_AI_RUN_NODULES"] == "1" and not_recorded:
        raise SystemExit(
            "拒绝启用推理：请先记录 lung_nodules 任务/权重许可和脱敏样本验证，再将以下项设为 yes："
            + ", ".join(not_recorded)
        )
    require_venv()
    environment = runtime_environment(settings)
    for command in (
        ["nvidia-smi", "-L"],
        [
            str(VENV_PYTHON),
            "-c",
            "import skimage, torch; assert torch.cuda.is_available(), 'CUDA is unavailable'",
        ],
    ):
        try:
            subprocess.run(command, check=True, env=environment)
        except (FileNotFoundError, subprocess.CalledProcessError) as exc:
            raise SystemExit(f"拒绝启用推理：GPU 预检失败：{exc}") from exc


def bootstrap(python: str) -> None:
    if VENV_PYTHON.exists():
        print(".venv 已存在；不会覆盖。")
    else:
        subprocess.run([python, "-m", "venv", str(SERVICE_DIR / ".venv")], check=True)
    subprocess.run([str(VENV_PYTHON), "-m", "pip", "install", "--upgrade", "pip"], check=True)
    # The selected PAI image exposes CUDA 12.4; use the matching official wheel
    # instead of letting an unconstrained dependency choose a newer CUDA runtime.
    subprocess.run(
        [
            str(VENV_PYTHON), "-m", "pip", "install", "torch==2.6.0", "torchvision==0.21.0",
            "--index-url", "https://download.pytorch.org/whl/cu124",
        ],
        check=True,
    )
    subprocess.run([str(VENV_PYTHON), "-m", "pip", "install", "-r", "requirements.txt"], cwd=SERVICE_DIR, check=True)
    print("依赖安装完成；未执行任何 GPU 推理。")


def preflight() -> None:
    require_gpu_preflight(load_settings())
    print("部署预检通过。")


def prepare_weights() -> None:
    require_venv()
    settings = load_settings()
    if settings["PULMONARY_AI_RUN_NODULES"] == "1":
        not_recorded = _missing_inference_acknowledgements(settings)
        if not_recorded:
            raise SystemExit(
                "拒绝下载 lung_nodules 权重：请先记录任务/权重许可和脱敏样本验证，再将以下项设为 yes："
                + ", ".join(not_recorded)
            )
    environment = runtime_environment(settings)
    download_tool = VENV_PYTHON.with_name("totalseg_download_weights")
    if not download_tool.is_file():
        raise SystemExit("未找到 totalseg_download_weights；请先运行：python deploy_dsw.py bootstrap")
    tasks = ["total"]
    if settings["PULMONARY_AI_RUN_NODULES"] == "1":
        tasks.append("lung_nodules")
    print(f"TotalSegmentator 权重目录：{environment['TOTALSEG_HOME_DIR']}")
    for task in tasks:
        command = [str(download_tool), "-t", task]
        for attempt in range(1, WEIGHT_DOWNLOAD_ATTEMPTS + 1):
            try:
                print(f"准备 TotalSegmentator 权重：{task}（第 {attempt}/{WEIGHT_DOWNLOAD_ATTEMPTS} 次）")
                subprocess.run(command, cwd=SERVICE_DIR, env=environment, check=True)
                break
            except subprocess.CalledProcessError as exc:
                if attempt == WEIGHT_DOWNLOAD_ATTEMPTS:
                    raise SystemExit(
                        f"TotalSegmentator 权重下载失败：{task}。"
                        "请保留上述日志；网络不稳定时可在有稳定网络的机器下载 .totalsegmentator 后复制到该目录。"
                    ) from exc
                print("权重下载中断，稍后重试。")
    print("TotalSegmentator 权重准备完成；未执行任何 DICOM 推理。")


def start() -> None:
    settings = load_settings()
    require_venv()
    require_gpu_preflight(settings)
    environment = runtime_environment(settings)
    if not inference_enabled(settings):
        # A disabled deployment cannot expose CUDA to a mistakenly submitted job.
        environment["CUDA_VISIBLE_DEVICES"] = ""
        print("推理已禁用：服务仅提供健康检查；任务提交会返回明确的 503。")
    else:
        print("推理已显式启用：仅可用于已记录许可和脱敏样本验证的原型评估。")
    subprocess.run(
        [
            str(VENV_PYTHON),
            "-m",
            "uvicorn",
            "app:app",
            "--host",
            settings["PULMONARY_AI_BIND_HOST"],
            "--port",
            settings["PULMONARY_AI_PORT"],
        ],
        cwd=SERVICE_DIR,
        env=environment,
        check=True,
    )


def health(url: str) -> None:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise SystemExit(f"健康检查失败：{exc}") from exc
    if payload.get("ok") is not True:
        raise SystemExit(f"健康检查返回异常：{payload}")
    print(json.dumps(payload, ensure_ascii=False))
    print("健康检查不提交推理任务。")


def offline(input_path: str, output_path: str | None) -> None:
    require_venv()
    settings = load_settings()
    require_gpu_preflight(settings)
    command = [str(VENV_PYTHON), "offline_job.py", input_path]
    if output_path:
        command.extend(("--output", output_path))
    subprocess.run(command, cwd=SERVICE_DIR, env=runtime_environment(settings), check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Alibaba DSW pulmonary-ai deployment helper")
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap_parser = commands.add_parser("bootstrap", help="create venv and install existing requirements")
    bootstrap_parser.add_argument("--python", default=sys.executable, help="DSW Python interpreter")
    commands.add_parser("preflight", help="check explicit inference prerequisites")
    commands.add_parser("prepare-weights", help="download required TotalSegmentator weights without inference")
    commands.add_parser("start", help="start uvicorn with explicit bind/configuration")
    health_parser = commands.add_parser("health", help="call /health without running inference")
    health_parser.add_argument("--url", default="http://127.0.0.1:8020/health")
    offline_parser = commands.add_parser("offline", help="run an exported WT32 task package on this DSW GPU")
    offline_parser.add_argument("input", help="WT32 exported DSW task ZIP")
    offline_parser.add_argument("--output", help="result ZIP path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "bootstrap":
        bootstrap(args.python)
    elif args.command == "preflight":
        preflight()
    elif args.command == "prepare-weights":
        prepare_weights()
    elif args.command == "start":
        start()
    elif args.command == "health":
        health(args.url)
    else:
        offline(args.input, args.output)


if __name__ == "__main__":
    main()
