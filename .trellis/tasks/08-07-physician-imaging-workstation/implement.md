# 医生端影像后处理工作站：实施计划

## First Delivery Checklist

1. Add physician-domain SQLAlchemy models, Pydantic contracts, migration, and additive router registration.
2. Add an idempotent local-sample importer that reads the approved `lidc-idri-0314` manifest and validates source UID relationships before exposing the study.
3. Add worklist, study-detail, application-case, mock-job, artifact-review, and report-draft endpoints with tests.
4. Add a separate desktop route shell and physician-workstation feature modules; do not alter legacy scan-console page layout.
5. Build the pulmonary-nodule worklist and workspace around the real local CT study, compact study/series context, image viewport, artifact inspector, and editable draft panel.
6. Reuse existing Cornerstone stack rendering only through a small physician viewport wrapper. Keep MPR/3D enhancement behind the new series contract rather than copying legacy `ViewScreen` state.
7. Surface manual reference, historical candidate, and mock-result provenance distinctly; allow a durable review decision for each artifact.
8. Add explicit TotalSegmentator provider configuration and unavailable/slow states, but do not install or invoke it by default.
9. Add the visible whole-body-bone application entry with sample-data pending state, preserving the same application-case and provider seams.
10. Run focused backend/frontend tests, lint, build, and a local browser smoke test with the public sample path configured.

## Validation Gates

### Data and backend

- Confirm the local manifest has one CT source series, four manual SEG references, nine benchmark candidate SEG records, and four SR evidence records.
- Reject a sample manifest if a segmentation references a different source series UID.
- Verify importer idempotency and verify unavailable data root does not expose arbitrary filesystem content.
- Verify a mock job persists provenance and a review decision survives reload.
- Run `\.venv\Scripts\python.exe -m unittest discover -s backend\tests`.

### Frontend

- Verify the `/physician` shell renders at 1920 × 1080 without tablet scaling or controller chrome.
- Verify study-first selection recommends the pulmonary-nodule application.
- Verify CT source can load and that unavailable image/provider states retain study context.
- Verify reference, benchmark, and WT32 mock results are distinguishable by source, version, and review state.
- Verify report-draft edits persist and are labeled as prototype assistance requiring human confirmation.
- Run focused tests, then `npm.cmd run lint` and `npm.cmd run build` from `ui-review`.

### Safety and regression

- Verify no scanner control route, scan-session source record, or raw DICOM file is mutated.
- Verify no UI calls an artifact a diagnosis, a final report, or clinical ground truth.
- Verify cloud providers require explicit configuration and do not run in the default developer path.

## Rollback Points

- Database rollback: downgrade the physician-domain Alembic revision only.
- Feature rollback: remove the `/physician` route registration; legacy scan-console routes remain unchanged.
- Data rollback: remove only the local importer index records; source DICOM stays untouched in the external data directory.
- Provider rollback: use the deterministic mock provider; no external provider is required for core workflow availability.
