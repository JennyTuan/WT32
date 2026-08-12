# Pulmonary nodule AI workspace implementation plan

1. Add a GPU-deployable pulmonary-AI FastAPI service with pinned dependencies,
   Docker configuration, input/archive validation, TotalSegmentator execution,
   job status, a five-lobe DICOM SEG, a gated nodule DICOM SEG, and a
   labelled patient-coordinate PLY surface output.
2. Add physician-side provider configuration and a gateway client that securely
   packages the known sample series, submits jobs, polls status, persists
   provenance, and surfaces service failures.
3. Extend the physician study/artifact contracts and tests for model-run
   status, immutable AI artifacts, source-series alignment, and refresh-safe
   persistence.
4. Add `/physician/worklist` and make the workspace route study-key driven.
5. Replace the single stack viewport with existing four-up MPR and reserve the
   fourth pane for the true five-lobe PLY surface when it is available; retain
   the CT overview only as a clearly-labelled fallback.
6. Add AI/revision overlay controls, candidate selection, and a distinct
   physician revision layer with the smallest verified Cornerstone editing
   primitive.
7. Add focused API/UI tests, run backend tests, frontend lint/build, and a
   GPU-host smoke test against the de-identified sample. Confirm unavailable
   GPU-service behavior leaves MPR and manual review usable.

## Validation

- `\.venv\Scripts\python.exe -m unittest discover -s backend\tests`
- `npm.cmd run lint` and `npm.cmd run build` from `ui-review`
- GPU-service smoke test: submit `lidc-idri-0314`, record actual elapsed time,
  confirm the five-lobe DICOM SEG, nodule DICOM SEG, and five-lobe PLY are all
  returned; verify the PLY is rendered in the fourth pane and the AI result is
  still labelled as preliminary and requiring physician confirmation.
- Verify the original CT and AI artifact remain unchanged after physician edits.

## Rollback

- Disable the provider URL to return an explicit unavailable state.
- Remove only generated physician artifacts/revisions; retain source DICOM and
  imported manual references.
- The legacy scan-console and `/image-viewer` routes remain untouched.
