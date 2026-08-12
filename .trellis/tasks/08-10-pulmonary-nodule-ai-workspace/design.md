# Pulmonary nodule AI workspace design

## Delivery shape

The feature adds an application-owned pulmonary-nodule inference path. It
does not change scanner control, protocol templates, scan sessions, source
DICOM, or the legacy image viewer.

```text
Browser
  -> WT32 physician API (authenticated, sample-aware)
    -> internal pulmonary-AI service (configured GPU endpoint)
      -> TotalSegmentator total (five lung lobes) + lung_nodules
    <- job state + DICOM SEG / spatial result + surface mesh
  <- physician artifact metadata + safe overlay endpoint
```

The browser never submits arbitrary paths or raw DICOM directly to the model
service. WT32 only submits the selected, validated source series from the
sample root. The model service has no scanner control functions.

## Model-service contract

Provide a small FastAPI service in a separate GPU-deployable directory. It
accepts one ZIP archive of a CT DICOM series plus a caller-generated run ID and
returns a job ID. The service exposes job state and, after success, a DICOM SEG
artifacts plus a browser-deliverable surface mesh. The runner uses the
Apache-2.0 `total` task with an explicit five-lobe ROI subset, as well as the
separately licensed `lung_nodules` task. It records package/model versions and
retains the actual SegmentLabels; whole-lung context must never be presented
as five lobes.

The service must reject malformed archives, limit input size, use a per-job
temporary directory, and never echo DICOM input. It returns explicit failed
states; it must not fabricate a segmentation when TotalSegmentator is missing,
the GPU is unavailable, or geometry export fails.

## WT32 backend adapter

Add a focused physician-AI gateway in the physician router or an adjacent
provider module, following the existing reconstruction-service gateway style:

- `POST /api/physician/studies/{study_key}/ai-runs` validates the fixed source
  series, submits an in-memory/temporary ZIP to the configured internal URL,
  and persists provider/run/version/status provenance in the physician case
  document.
- `GET /api/physician/ai-runs/{run_id}` returns the current service status.
- `GET /api/physician/studies/{study_key}/artifacts/{artifact_id}/overlay`
  parses returned DICOM SEG into source-slice spans using the existing
  alignment logic.
- A generated AI artifact is immutable. A physician edit creates a distinct
  revision artifact with `parent_artifact_id`; both remain independently
  selectable and visible.

The initial implementation may poll the internal service from the browser at a
bounded interval. It should not copy the unrelated in-memory fracture-job
implementation because the pulmonary run must survive a page refresh and carry
artifact provenance.

## Workspace composition

`/physician/worklist` lists the available de-identified study and routes the
chosen study to its fixed pulmonary-nodule application. The workspace uses the
existing `CornerstoneMPRViewport` in four-up layout:

1. axial,
2. coronal,
3. sagittal, and
4. a 3D volume-rendering panel.

All views share patient-space crosshairs. A selected nodule recenters all
views. AI lung/nodule overlay and physician-revision overlay are independently
toggleable. The 3D panel renders the generated five-lobe surface in fixed,
distinguishable colors and highlights the selected nodule; if a generated lobe
mesh is missing, it explicitly falls back to CT volume rendering rather than
claiming an isolated lung surface.

Physician editing is an application-owned revision layer: add/remove voxels or
contours, undo/redo within the open workspace, reset revision to AI baseline,
and save. The selected editing primitive must be verified against the existing
Cornerstone tool support before implementation; no raw DICOM pixels or AI
artifact are mutated.

## Persistence and safety

Store run/provenance and physician revision data in the existing physician
document boundary for the one-study prototype, with a concise `ponytail:`
comment documenting the single-study ceiling and planned relational upgrade.
Persist model package/version, service endpoint identity (not credentials),
source-series UID, run timestamps, status, and artifact relationships.

All labels say `AI 初步分割` and `需医生确认`. The workspace does not calculate
or display malignancy/risk grades, recommendations, final reports, or clinical
claims.
