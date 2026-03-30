from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/recon-series", tags=["recon-series"])


def _get_series_or_404(series_id: int, db: Session) -> models.Series:
    series = db.query(models.Series).filter(models.Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Series not found")
    return series


def _require_recon_compatible_series(series: models.Series) -> None:
    if series.series_type not in {"helical", "axial"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recon series are only allowed on helical or axial series",
        )


def _get_recon_or_404(recon_id: int, db: Session) -> models.ReconSeries:
    recon = db.query(models.ReconSeries).filter(models.ReconSeries.id == recon_id).first()
    if not recon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recon series not found")
    return recon


@router.get("/", response_model=list[schemas.ReconSeries])
def list_recon_series(db: Session = Depends(get_db)):
    return db.query(models.ReconSeries).order_by(models.ReconSeries.id.asc()).all()


@router.get("/{recon_id}", response_model=schemas.ReconSeries)
def get_recon_series(recon_id: int, db: Session = Depends(get_db)):
    return _get_recon_or_404(recon_id, db)


@router.post("/", response_model=schemas.ReconSeries, status_code=status.HTTP_201_CREATED)
def create_recon_series(payload: schemas.ReconSeriesCreate, db: Session = Depends(get_db)):
    series = _get_series_or_404(payload.series_id, db)
    _require_recon_compatible_series(series)
    recon = models.ReconSeries(**payload.model_dump())
    db.add(recon)
    db.commit()
    db.refresh(recon)
    return recon


@router.put("/{recon_id}", response_model=schemas.ReconSeries)
def update_recon_series(recon_id: int, payload: schemas.ReconSeriesUpdate, db: Session = Depends(get_db)):
    recon = _get_recon_or_404(recon_id, db)
    updates = payload.model_dump(exclude_unset=True)
    if "series_id" in updates:
        series = _get_series_or_404(updates["series_id"], db)
        _require_recon_compatible_series(series)
    for field, value in updates.items():
        setattr(recon, field, value)
    db.commit()
    db.refresh(recon)
    return recon


@router.delete("/{recon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recon_series(recon_id: int, db: Session = Depends(get_db)):
    recon = _get_recon_or_404(recon_id, db)
    db.delete(recon)
    db.commit()
