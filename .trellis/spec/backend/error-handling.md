# Backend Error Handling

Routes raise `fastapi.HTTPException` with a specific status and `detail`, as
in `backend/routers/patients.py` and `backend/routers/contrast_configs.py`.
Use `404` for absent resources, `400` for invalid requests or conflicts that
the current API represents as validation errors, and the existing router's
status-code style for consistency.

Catch narrow expected exceptions and preserve their cause:

```python
try:
    db.commit()
except IntegrityError as exc:
    db.rollback()
    raise HTTPException(status_code=400, detail="patient_id already exists") from exc
```

Only catch broad exceptions at a genuine boundary, such as defensive loading
of hand-edited local JSON in `backend/routers/dicom_settings.py`. Never hide a
failed persistence operation or convert it into a successful simulated scan.

Pydantic schemas own request-shape validation. Keep error copy clear about
prototype behavior: parameter and dose values are estimated/reference data and
require confirmation; do not phrase a validation result as a safety approval.
