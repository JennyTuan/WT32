# Domain Docs

WT32 is a single-context repository for a CT scanner control-console prototype. It is not clinical software.

Engineering skills should consume the domain documentation below before changing CT workflow behavior, safety wording, scan parameters, dose display, DICOM handling, protocol templates, or scan sessions.

## Required Reading

- `README.md`: project setup, architecture, routes, and repository layout.
- `docs/README.md`: documentation map and current domain notes.
- `docs/CT_DOMAIN_CONTEXT.md`: CT terminology, safety boundaries, domain vocabulary, and wording constraints.

If `docs/adr/` exists, read ADRs that touch the area being changed. The directory does not exist yet; future architecture decisions should live there.

## Domain Rules

- WT32 is for product and UI validation only.
- Do not imply real device control, diagnostic conclusions, treatment advice, guaranteed safety, or final dose approval.
- Use wording such as "estimated", "reference", "simulation", and "requires confirmation" for scan parameters, dose, contrast, and safety-related UI copy.
- Preserve the distinction between protocol templates and scan sessions. Session edits must not mutate protocol templates unless the workflow explicitly saves a template.
- Use existing project vocabulary for scan modes, acquisition types, series, protocols, patients, dose, DOM, gating, 4D, DICOM, and service workflows.

## Testing Implications

Tests should describe observable WT32 behavior using the project vocabulary. Favor vertical slices such as:

- Creating a scan session clones protocol template fields into a session snapshot.
- Editing session parameters does not mutate the source protocol template.
- Dose or safety UI copy remains qualified as estimated/reference/simulation.
- Gating and 4D workflows remain distinct by acquisition type and route behavior.

Avoid tests that lock onto private helper shapes unless the helper is the only stable public boundary currently available.
