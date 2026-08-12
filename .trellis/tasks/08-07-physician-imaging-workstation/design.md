# 医生端影像后处理工作站：技术设计

## Delivery Boundary

The first delivery is a desktop physician-workstation slice for the local, de-identified `lidc-idri-0314` sample. It is a new application domain on this branch, not a replacement for the scanner control-console routes.

The slice proves one continuous workflow:

1. A physician opens the dedicated worklist and selects a chest CT study.
2. The workstation recommends the pulmonary-nodule application and opens its workspace.
3. The physician reviews CT images with existing Cornerstone rendering, changes window presets, and selects a reference or candidate segmentation overlay.
4. A deterministic WT32 segmentation job runs and is stored as a reviewable result.
5. The physician records a review decision and edits a prototype report draft.

This delivery does not claim diagnosis, real PACS/DICOMweb integration, real-device control, or clinical report finalization.

## Product and Route Boundary

`/physician` is the physician-workstation root. It has its own full-width desktop shell and does not use `App.tsx` tablet scale, bezel, controller overlays, or scan-console navigation.

Initial child routes:

- `/physician/worklist`: study-first worklist and application recommendation.
- `/physician/studies/:studyKey/pulmonary-nodule`: pulmonary-nodule workspace.
- `/physician/studies/:studyKey/bone`: reserved desktop entry with a clear sample-data dependency state.

The legacy `/image-viewer` stays untouched for scan-quality confirmation. Rendering primitives may be reused, but physician domain state must not live in `ViewScreen.tsx`.

## Domain Boundary

The physician domain is separate from scanner session records.

```text
Existing scanner data (read-only)                 Physician workstation (new)
Patient / ScanExam / ScanSession / recon series   PhysicianImagingStudy
                                                     └─ PhysicianImagingSeries
                                                          └─ source files or source session reference

PhysicianImagingStudy + application code          ApplicationCase
                                                     ├─ WorkspacePreference
                                                     ├─ ReviewArtifact
                                                     │   └─ ArtifactReview
                                                     └─ ReportDraft → ReportDraftRevision
```

`PhysicianImagingStudy` is a facade. For the first sample it is backed by a local sample manifest; later it can be backed by a completed WT32 scan session or PACS/DICOMweb without changing the frontend contract.

Raw DICOM remains external and read-only. The database stores stable identifiers, relative source paths, non-identifying display data, user-owned work artifacts, and provenance only. It never stores pixel copies.

## Persistent Data Contracts

New SQLAlchemy tables use the `physician_` prefix and new Pydantic contracts in `backend/schemas.py` or a physician-specific schema module.

| Entity | Persisted responsibility | Required provenance |
| --- | --- | --- |
| `PhysicianImagingStudy` | Worklist-facing study facade and source adapter metadata | source kind, source key, patient pseudonym, study UID, body part |
| `PhysicianImagingSeries` | Displayable image series and source file mapping | study FK, series UID, modality, series role, relative path |
| `PhysicianApplicationCase` | A study opened under `general_review`, `pulmonary_nodule`, `whole_body_bone`, or future `cardiac_coronary` | study FK, application code, owner, status |
| `PhysicianArtifact` | Immutable external reference, model result, or future segmentation artifact | case FK, type, source kind, provider, model/version, source series UID, payload version |
| `PhysicianArtifactReview` | Human accept, reject, ignore, or edited review state | artifact FK, reviewer, status, note, timestamp |
| `PhysicianReportDraft` | Editable prototype draft | case FK, owner, content JSON, revision number |
| `PhysicianReportDraftRevision` | Immutable previous content snapshot | draft FK, author, revision, content JSON |

The first import seeds one study and the original sample artifacts. Four manual DICOM SEG artifacts are source kind `manual_reference`; nine historical QIN SEG artifacts are `external_benchmark_candidate`; SR objects are `reference_evidence`. They are not diagnostic ground truth.

The deterministic mock creates a new `wt32_mock` artifact and a durable job/progress record. Future TotalSegmentator and other image-model providers produce the same result shape but must identify task, provider, model version, and DICOM spatial reference. DeepSeek is a separate report-text provider and never creates a segmentation artifact.

## API Boundary

Initial backend endpoints live under `/api/physician` and use the authenticated user identity where available.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/worklist` | List available physician studies and compatible application recommendations. |
| `GET` | `/studies/{study_key}` | Return study, series, artifact metadata, and source URLs. |
| `POST` | `/cases` | Create or reopen the current user's application case. |
| `POST` | `/cases/{case_id}/mock-segmentation` | Start a deterministic prototype segmentation job. |
| `GET` | `/jobs/{job_id}` | Read persisted job state. |
| `PATCH` | `/artifacts/{artifact_id}/review` | Record a human review decision. |
| `GET/PUT` | `/cases/{case_id}/report-draft` | Read or update an editable versioned draft. |

The API returns application-owned source URLs. The browser must never receive arbitrary filesystem paths. A dedicated local sample mount validates every requested path remains below `PHYSICIAN_SAMPLE_DATA_ROOT`; the default points to the explicitly configured local data directory, not a repository asset directory.

## UI Composition

The desktop workspace uses a dense, restrained clinical-workstation composition:

```text
Top status strip: product / worklist / active study / app switcher / account
Left rail: worklist return, fixed study facts, active-series context, a nodule-result ledger, review controls, and report draft. Application choice happens before entering a workspace; within an application route the active application is fixed context, not a switchable menu.
Center: dominant image viewport and compact viewport tools. There is no right inspector in the pulmonary-nodule workspace.
Bottom status line: image position, window preset, processing state
```

`app switcher` is replaced by an application-context label after entry. The application selector exists only in the study-first worklist. This prevents a user from carrying an artifact/review state into a clinically different workflow by changing a menu item in place.

The image is visually dominant. Blue/teal indicates navigation and active selection; red is reserved for blocking errors; review states are textual as well as color-coded. No chat cards, gradients, glass panels, decorative glow, or vendor UI imitation.

The workstation shell is a fixed-height desktop canvas with no document-level vertical scroll. The side ledger is deliberately compact; report editing opens as an in-workspace panel instead of extending the page below the viewport.

Result provenance uses a continuous, table-like ledger with a column header, ruled rows, and a single active-row marker. Do not present each result as an isolated rounded card.

The first page can initially use the existing stack viewport for real DICOM; MPR/3D integration is staged behind the same series contract. A failed image or unavailable provider must leave study context and manual review accessible.

Manual DICOM SEG references are parsed server-side into per-source-slice, read-only mask spans and returned only through an artifact-overlay endpoint. Selecting an available reference result locates the first annotated CT slice and renders a translucent mask in the viewport. A provider result without spatial DICOM SEG is explicitly marked `无空间掩膜`; it must never receive a simulated overlay. Future model artifacts use this same contract only after producing a validated spatial result.

## Model Provider Strategy

```text
Segmentation provider adapter
  mock → deterministic, zero dependency, default for every developer
  benchmark → imported historical DICOM SEG, read-only comparison
  TotalSegmentator → optional local process, task-specific configuration
  future hosted image model → external job adapter

Report-text provider adapter
  mock → deterministic draft assistance
  DeepSeek → BYOK cloud adapter for de-identified, human-approved facts only
```

The first TotalSegmentator integration is not required for page availability. It is an optional provider enabled only by explicit environment configuration and a verified license/runtime. On this workstation, the lack of a CUDA-capable GPU means the UI must present it as potentially slow and cancellable.

## Compatibility, Migration, and Rollback

- New database tables and routes are additive; no scanner tables or legacy routes are modified.
- A single Alembic revision creates the physician tables. Downgrade removes only the new tables.
- The sample importer is idempotent by source key and safe to rerun.
- If `PHYSICIAN_SAMPLE_DATA_ROOT` is unavailable, the worklist returns a clear sample-unavailable state and no unrelated demo image is substituted.
- Real model credentials are environment variables, excluded from source control. No cloud call is performed without an explicitly configured provider.
