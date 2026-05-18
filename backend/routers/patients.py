from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/patients", tags=["patients"])


def _derive_full_name(last_name: str | None, first_name: str | None) -> str | None:
    """Compose Chinese-order full name from last + first (last first)."""
    parts = [p for p in (last_name, first_name) if p]
    return "".join(parts) if parts else None


def _serialize_patient(patient: models.Patient, latest_status: str | None) -> dict:
    return {
        "id": patient.id,
        "name": patient.name,
        "last_name": patient.last_name,
        "first_name": patient.first_name,
        "patient_id": patient.patient_id,
        "id_number": patient.id_number,
        "gender": patient.gender,
        "birth_date": patient.birth_date,
        "height": patient.height,
        "weight": patient.weight,
        "created_at": patient.created_at,
        "latest_scan_status": latest_status,
    }


@router.get("/", response_model=list[schemas.Patient])
def list_patients(db: Session = Depends(get_db)):
    patients = db.query(models.Patient).order_by(models.Patient.id.asc()).all()
    # Latest ScanSession.status per patient (by created_at desc)
    rows = (
        db.query(models.ScanSession.patient_id, models.ScanSession.status, models.ScanSession.created_at)
        .order_by(models.ScanSession.created_at.desc(), models.ScanSession.id.desc())
        .all()
    )
    latest_by_patient: dict[int, str] = {}
    for patient_id, status_val, _created in rows:
        if patient_id not in latest_by_patient:
            latest_by_patient[patient_id] = status_val
    return [_serialize_patient(p, latest_by_patient.get(p.id)) for p in patients]


def _latest_status_for(patient_id: int, db: Session) -> str | None:
    row = (
        db.query(models.ScanSession.status)
        .filter(models.ScanSession.patient_id == patient_id)
        .order_by(models.ScanSession.created_at.desc(), models.ScanSession.id.desc())
        .first()
    )
    return row[0] if row else None


@router.get("/lookup/{patient_code}", response_model=schemas.Patient)
def get_patient_by_code(patient_code: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.patient_id == patient_code).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return _serialize_patient(patient, _latest_status_for(patient.id, db))


@router.get("/{patient_id}", response_model=schemas.Patient)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return _serialize_patient(patient, _latest_status_for(patient.id, db))


@router.post("/", response_model=schemas.Patient, status_code=status.HTTP_201_CREATED)
def create_patient(payload: schemas.PatientCreate, db: Session = Depends(get_db)):
    exists = db.query(models.Patient).filter(models.Patient.patient_id == payload.patient_id).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id already exists")

    data = payload.model_dump()
    # Auto-compose name when not provided; require at least one name field
    if not data.get("name"):
        derived = _derive_full_name(data.get("last_name"), data.get("first_name"))
        if not derived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either name or last_name/first_name must be provided",
            )
        data["name"] = derived

    patient = models.Patient(**data)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return _serialize_patient(patient, None)


@router.put("/{patient_id}", response_model=schemas.Patient)
def update_patient(patient_id: int, payload: schemas.PatientUpdate, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    updates = payload.model_dump(exclude_unset=True)
    if "patient_id" in updates:
        duplicate = (
            db.query(models.Patient)
            .filter(models.Patient.patient_id == updates["patient_id"], models.Patient.id != patient_id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id already exists")

    for field, value in updates.items():
        setattr(patient, field, value)

    # Re-derive name when last/first updated but name wasn't explicitly set
    if ("last_name" in updates or "first_name" in updates) and "name" not in updates:
        derived = _derive_full_name(patient.last_name, patient.first_name)
        if derived:
            patient.name = derived

    db.commit()
    db.refresh(patient)
    return _serialize_patient(patient, _latest_status_for(patient.id, db))


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    db.delete(patient)
    db.commit()
