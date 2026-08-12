"""Run a WT32 offline task package on the local DSW GPU."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path

from deploy_dsw import load_settings, runtime_environment


MAX_JOB_BYTES = 1_200_000_000


def _load_job(path: Path) -> tuple[dict[str, object], bytes]:
    if not path.is_file() or path.stat().st_size > MAX_JOB_BYTES:
        raise SystemExit("任务包不存在或超过原型大小限制。")
    try:
        with zipfile.ZipFile(path) as archive:
            names = [item.filename for item in archive.infolist() if not item.is_dir()]
            if sorted(names) != ["job.json", "series.zip"]:
                raise ValueError("unexpected task files")
            job = json.loads(archive.read("job.json").decode("utf-8"))
            series = archive.read("series.zip")
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, zipfile.BadZipFile) as exc:
        raise SystemExit("WT32 离线任务包无效。") from exc
    if not isinstance(job, dict):
        raise SystemExit("WT32 离线任务清单无效。")
    try:
        uuid.UUID(hex=str(job["run_id"]))
    except (KeyError, ValueError) as exc:
        raise SystemExit("WT32 离线任务 ID 无效。") from exc
    if job.get("format_version") != 1 or job.get("study_key") != "lidc-idri-0314":
        raise SystemExit("当前脚本不支持这个 WT32 离线任务版本或病例。")
    return job, series


def run(input_path: Path, output_path: Path | None) -> Path:
    settings = load_settings()
    if settings["PULMONARY_AI_ENABLE_INFERENCE"] != "1":
        raise SystemExit("请先在 .env 中将 PULMONARY_AI_ENABLE_INFERENCE=1。")
    os.environ.update(runtime_environment(settings))

    import app as pulmonary_app
    import pydicom

    job, series = _load_job(input_path)
    run_id = str(job["run_id"])
    root = Path(tempfile.mkdtemp(prefix=f"wt32-offline-{run_id}-", dir=pulmonary_app.DATA_DIR))
    input_dir, artifact_dir = root / "input", root / "artifacts"
    input_dir.mkdir()
    artifact_dir.mkdir()
    try:
        pulmonary_app._extract_dicom_archive(series, input_dir)
        first_dicom = next(input_dir.rglob("*.dcm"), None)
        if first_dicom is None:
            raise SystemExit("任务包中没有可处理的 CT DICOM。")
        dataset = pydicom.dcmread(first_dicom, stop_before_pixels=True, specific_tags=["SeriesInstanceUID"])
        if str(dataset.SeriesInstanceUID) != str(job.get("source_series_uid", "")):
            raise SystemExit("任务包中的 CT 序列与任务清单不匹配。")

        inference_run = pulmonary_app.Run(id=run_id)
        asyncio.run(pulmonary_app._run(inference_run, input_dir, artifact_dir))
        if inference_run.status != "succeeded":
            detail = inference_run.error or "请查看上方 TotalSegmentator 日志。"
            raise SystemExit(f"分割未完成：{inference_run.stage}。{detail}")

        result = {
            **job,
            "status": "succeeded",
            "stage": inference_run.stage,
            "provenance": inference_run.provenance,
            "artifacts": [
                {"kind": artifact.kind, "filename": artifact.path.name}
                for artifact in inference_run.artifacts.values()
            ],
        }
        destination = output_path or input_path.with_name(f"{input_path.stem}-result.zip")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("job.json", json.dumps(result, ensure_ascii=False, indent=2))
            for artifact in inference_run.artifacts.values():
                archive.write(artifact.path, artifact.path.name)
        print(f"分割完成。请把这个结果包下载并导入 WT32：{destination}")
        return destination
    finally:
        shutil.rmtree(root, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a WT32 offline DSW segmentation task")
    parser.add_argument("input", type=Path, help="WT32 exported DSW task ZIP")
    parser.add_argument("--output", type=Path, help="result ZIP path")
    args = parser.parse_args()
    run(args.input.resolve(), args.output.resolve() if args.output else None)


if __name__ == "__main__":
    main()
