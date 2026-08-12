# Open-source pulmonary-nodule AI options (research note)

## Decision in one sentence

TotalSegmentator now offers a directly runnable `lung_nodules` task that
outputs both lung and lung-nodule masks. It is the shortest path to a
prototype AI mask, but still requires local validation and explicit
prototype-only wording. For a fully controlled, product-owned model,
train and validate a versioned nnU-Net nodule-segmentation model on properly
licensed data; preserve the output as a spatial mask separate from the
doctor's edit layer.

This is a CT-console prototype, not diagnostic software. All UI wording must
say `AI preliminary result / simulation / requires physician confirmation`,
not imply a diagnosis or final report.

## Candidates checked

| Candidate | What is directly usable | Output and MPR-overlay fit | Licence / runtime | Decision for WT32 |
|---|---|---|---|---|
| [TotalSegmentator](https://github.com/wasserth/TotalSegmentator) `lung_nodules` | A runnable CT nodule-mask task (`TotalSegmentator -i ct.nii.gz -o seg -ta lung_nodules`). | Outputs lung and nodule masks; geometrically suitable for MPR overlay. The current Python API accepts a DICOM folder and can emit DICOM SEG when `highdicom` is installed. | The repository and current `lung_nodules` task are Apache-2.0/open in the official task registry. Runs on CPU or GPU; Python >=3.10 and PyTorch >=2.0 are documented. | Fastest real-mask proof of concept; first validate on the local de-identified sample and keep output explicitly prototype-only. |
| [MONAI Model Zoo: Lung Nodule CT Detection](https://github.com/Project-MONAI/model-zoo/tree/dev/models/lung_nodule_ct_detection) | A pretrained 3D RetinaNet model, trained on LUNA16, for pulmonary-nodule **detection**. | Returns `Nx6` 3D boxes, labels and scores, **not a voxel mask**. Boxes can drive candidate navigation in MPR and seed a later segmentation/edit operation, but cannot be rendered as the requested AI segmentation contour. It expects Nibabel volume data, with the documented training resolution 0.703125 x 0.703125 x 1.25 mm. | Bundle Apache-2.0; metadata states it is an example and “not to be used for diagnostic purposes”. Training notes specify at least 16 GB GPU memory; TensorRT export notes 32 GB. | Best immediately runnable, permissively licensed **candidate detector**. Use only behind the prototype wording, plus geometry regression tests. Pair it with a mask model before exposing “AI automatic segmentation”. |
| [nnU-Net v2](https://github.com/MIC-DKFZ/nnUNet) | A mature, self-configuring semantic-segmentation framework; it can train/infer a 3D U-Net for a supplied nodule-mask dataset. | Produces voxelwise segmentation, which is exactly the artifact needed for axial/coronal/sagittal MPR overlays, 3D rendering, and a separate doctor edit mask. It is a framework, however: its official repository does **not** ship a maintained pretrained LIDC/LUNA pulmonary-nodule segmentation task/weights. | Apache-2.0. Requires a curated training dataset, preprocessing plans, GPU inference/training environment, versioned weights, and local validation. | Recommended route for a real open model: build a WT32-owned, versioned model package from properly licensed CT + segmentation labels. This is development work, not a drop-in dependency. |

## Important distinction: detection is not segmentation

The MONAI bundle is valuable for the first half of the desired interaction:
`CT volume -> candidate location/score -> jump all MPR planes to candidate`.
It cannot produce the filled/outlined nodule that a physician can extend or
erase. The UI therefore needs either:

1. a second segmentation model which returns a binary 3D mask for each chosen
   candidate, or
2. a physician-initialised segmentation tool (for example, a seeded region or
   interactive model) that creates a distinct `physician edit` mask.

An automatic result and the physician's edits must never overwrite each other:
store `aiMask`, `physicianMask`, model/version, source-series UID and the
volume affine/spacing. Convert only at the boundary to a DICOM SEG object if
interoperability is needed. DICOM SEG must reference the original CT SOP
Instance UIDs; it cannot safely be treated as a screenshot overlay.

## Integration shape for the current prototype

1. Read the selected CT series into a canonical HU volume while retaining the
   DICOM patient-space geometry and source-instance mapping.
2. Invoke an isolated Python inference service with the complete volume;
   return candidates and/or a binary mask in that same patient geometry.
3. Persist an `AI preliminary segmentation` layer, not a report conclusion.
4. Render that layer in all MPR viewports and the 3D lung view; generate a
   separate editable `physician revision` layer on first edit.
5. Validate round-trip geometry: an overlay voxel must land on the same
   physical point in all three MPR planes and after export/import of DICOM SEG.

## Sources (primary)

- TotalSegmentator [README / command and runtime requirements](https://github.com/wasserth/TotalSegmentator#installation), [task registry](https://github.com/wasserth/TotalSegmentator/blob/master/totalsegmentator/registry.py), and [Python API DICOM SEG support](https://github.com/wasserth/TotalSegmentator/blob/master/totalsegmentator/python_api.py).
- MONAI [bundle README](https://github.com/Project-MONAI/model-zoo/blob/dev/models/lung_nodule_ct_detection/docs/README.md), [model metadata](https://github.com/Project-MONAI/model-zoo/blob/dev/models/lung_nodule_ct_detection/configs/metadata.json), and [Apache-2.0 licence](https://github.com/Project-MONAI/model-zoo/blob/dev/models/lung_nodule_ct_detection/LICENSE).
- nnU-Net [official repository and Apache-2.0 licence](https://github.com/MIC-DKFZ/nnUNet) and its [Nature Methods paper](https://doi.org/10.1038/s41592-020-01008-z).
- [DICOM Segmentation IOD](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.51.html) for the spatial-reference requirement of segmentation objects.
