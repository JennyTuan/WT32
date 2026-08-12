# WT32 pulmonary-AI service

This is an internal, authenticated GPU service for de-identified WT32 prototype
samples. It is not a clinical deployment, diagnostic tool, device-control
component, or source of a final report. Generated masks are AI preliminary
segmentations and require physician confirmation.

## Safe default

`PULMONARY_AI_ENABLE_INFERENCE=0` is the default. In that state `/health`
works but job creation returns HTTP 503; no inference is started. Keep the
service private and send the bearer token only from the WT32 backend.

Before setting the flag to `1`, run `python deploy_dsw.py preflight` after
recording the `lung_nodules` task/weight licence review and de-identified
sample validation in the deployment configuration. The lobe segmentation is
run alongside, not instead of, the existing licensed `lung_nodules` task.

## Model weights

Before the first GPU or offline job, run:

```bash
python deploy_dsw.py prepare-weights
```

This downloads the selected TotalSegmentator weights without submitting any
DICOM inference. The helper sets `TOTALSEG_HOME_DIR` to
`${PULMONARY_AI_DATA_DIR}/.totalsegmentator`, so a restarted service and later
offline jobs reuse the same weights. If DSW's network repeatedly drops during
the download, use the same official TotalSegmentator weight command on a
machine with stable network access, then copy that `.totalsegmentator`
directory into `PULMONARY_AI_DATA_DIR`.

## Successful-job artifacts

`GET /api/v1/pulmonary-nodule/jobs/{job_id}` and `/artifacts` list only these
generated artifacts. They never return the submitted DICOM archive.

When `PULMONARY_AI_ENABLE_INFERENCE=1` and `PULMONARY_AI_RUN_NODULES=0`, the
service deliberately runs only the open five-lobe task. It returns
`lung_lobes` and `lung_lobe_surface`, and its completed stage explicitly says
that the nodule task is disabled. This is a GPU smoke test for the 3D surface,
not a lung-nodule result.

| ID | Download endpoint | Format | Meaning |
| --- | --- | --- | --- |
| `lung_lobes` | `/artifacts/lung_lobes` | DICOM SEG | A verified set of exactly five TotalSegmentator lobe labels. |
| `lung_nodules` | `/artifacts/lung_nodules` | DICOM SEG | The nodule-only layer from `lung_nodules`; it is not a lobe classification. |
| `lung_lobe_surface` | `/artifacts/lung_lobe_surface` | Binary little-endian PLY 1.0 | A mesh made from the verified lobe SEG for browser delivery. |

The PLY has `float x/y/z` vertices in DICOM patient LPS millimetres. Each face
has a custom `int segment_number` property; artifact metadata maps that segment
number and the canonical label to its display colour. A consumer must use those
labels and numbers, rather than assuming a whole-lung mask represents five
lobes. The service fails the job rather than creating a placeholder mesh when
the lobe labels, DICOM SEG geometry, or mesh conversion are unavailable.

The service writes TotalSegmentator's model-download and inference messages to
the DSW service terminal. A job that exceeds 6 hours changes to `failed`
with no artifact, rather than remaining `running`; submit a new job only after
checking that terminal for the download or runtime error. If the terminal shows
a broken or incomplete model download, run `python deploy_dsw.py prepare-weights`
and retry the job only after the weights finish downloading.

`GET /api/v1/pulmonary-nodule/jobs/{job_id}/artifact` remains a compatibility
endpoint for the nodule DICOM SEG only.

## DSW bundle

Copy `dsw.env.example` to an untracked `.env`, use a newly generated API key,
then run `python deploy_dsw.py bootstrap`, `preflight`, and `start`. The upload
bundle contains this guide, `app.py`, `requirements.txt`, `deploy_dsw.py`,
`dsw.env.example`, and `Dockerfile`; do not add `.env`, DICOM, generated masks,
or model weights to it.
