# Pulmonary nodule AI workspace

## Goal

Turn the existing fixed-sample pulmonary-nodule workstation into a physician-led
review workflow: choose a chest CT study from the worklist, run a real
open-source AI preliminary segmentation, inspect it in synchronized MPR and a
3D lung view, then create a separately stored physician revision without
overwriting the AI result.

## Confirmed facts

- The current `/physician` route bypasses the worklist and opens the fixed
  `lidc-idri-0314` sample directly.
- The sample has one 275-instance chest CT series and existing manual DICOM
  SEG references; it currently has no model-produced spatial artifact.
- `CornerstoneMPRViewport` already supports linked axial/coronal/sagittal MPR
  and a fourth 3D volume-rendering panel.
- TotalSegmentator's `lung_nodules` task produces `lung` and `lung_nodules`
  masks, accepts a DICOM folder, and can create DICOM SEG when `highdicom` is
  installed. Its task/weight licence must be confirmed and recorded before
  any inference is enabled. It is not a clinical device.
- This machine has no CUDA GPU and the WT32 environment does not yet include
  PyTorch, TotalSegmentator, or highdicom. The task's `--fast` mode is not
  available for `lung_nodules`.
- TotalSegmentator documents local CLI/Python and web-app use; no stable public
  hosted inference API contract has been identified for application integration.

## Requirements

- Add a physician worklist entry point and route the selected sample into the
  pulmonary-nodule workspace.
- Replace the placeholder mock result with a real, isolated
  TotalSegmentator `lung_nodules` inference job for configured local sample
  data, including queued/running/succeeded/failed states and provenance.
- Preserve the source CT geometry and render AI lung-lobe/nodule masks in
  linked axial, coronal, sagittal, and 3D views.
- Provide physician editing tools that create a separate revision layer. The
  AI original must remain viewable and immutable; a physician revision is the
  only editable layer.
- Keep all wording prototype-only: AI preliminary result, reference/simulation
  where applicable, and requires physician confirmation. Do not produce a
  diagnosis, Lung-RADS classification, clinical recommendation, or final
  report.
- Do not mutate raw DICOM, the source CT series, or scan-session records.

## Provisional acceptance criteria

- [ ] A user can open `/physician/worklist`, select `lidc-idri-0314`, and
  enter the pulmonary-nodule workspace.
- [ ] Clicking AI preliminary segmentation starts a durable, provenance-bearing
  model job and surfaces an explicit failure state without blocking CT viewing.
- [ ] A successful job renders model-generated lung-lobe and nodule spatial
  masks in all three synchronized MPR views, plus a color-coded lung-lobe
  surface with nodule highlighting in the fourth view.
- [ ] A physician can add, erase, or restore edits in a revision layer while
  toggling the original AI layer independently.
- [ ] Source-series UID and spatial alignment are retained for any generated
  segmentation artifact; overlays land on the same physical point in all MPR
  views.
- [ ] Model/version, run status, and physician-review state remain visible and
  persist across a page refresh.

## Out of scope

- Clinical deployment, diagnostic accuracy claims, automatic risk grading,
  treatment/follow-up recommendations, formal reports, PACS/DICOMweb
  integration, and real patient data.
- A commercial third-party imaging-AI API, real patient data transfer, and
  retraining a model, unless separately approved.

## Key decision

- The model API is a WT32-owned GPU service. The browser calls only WT32;
  WT32 calls the internal service. No third-party hosted imaging-AI provider
  or real patient-data transfer is in scope.
