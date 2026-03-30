from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/scan-params", tags=["scan-params"])


def _get_series_or_404(series_id: int, db: Session) -> models.Series:
    series = db.query(models.Series).filter(models.Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Series not found")
    return series


def _require_series_type(series: models.Series, expected_type: str) -> None:
    if series.series_type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Series {series.id} is '{series.series_type}', expected '{expected_type}'",
        )


def _get_entity_or_404(model, entity_id: int, detail: str, db: Session):
    entity = db.query(model).filter(model.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return entity


def _save_single_param(db: Session, entity):
    db.add(entity)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_id already has a parameter set") from exc
    db.refresh(entity)
    return entity


@router.get("/topogram/", response_model=list[schemas.TopogramParam])
def list_topogram_params(db: Session = Depends(get_db)):
    return db.query(models.TopogramParam).order_by(models.TopogramParam.id.asc()).all()


@router.get("/topogram/{param_id}", response_model=schemas.TopogramParam)
def get_topogram_param(param_id: int, db: Session = Depends(get_db)):
    return _get_entity_or_404(models.TopogramParam, param_id, "Topogram param not found", db)


@router.post("/topogram/", response_model=schemas.TopogramParam, status_code=status.HTTP_201_CREATED)
def create_topogram_param(payload: schemas.TopogramParamCreate, db: Session = Depends(get_db)):
    series = _get_series_or_404(payload.series_id, db)
    _require_series_type(series, "topogram")
    entity = models.TopogramParam(**payload.model_dump())
    return _save_single_param(db, entity)


@router.put("/topogram/{param_id}", response_model=schemas.TopogramParam)
def update_topogram_param(param_id: int, payload: schemas.TopogramParamUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.TopogramParam, param_id, "Topogram param not found", db)
    updates = payload.model_dump(exclude_unset=True)
    if "series_id" in updates:
        series = _get_series_or_404(updates["series_id"], db)
        _require_series_type(series, "topogram")
    for field, value in updates.items():
        setattr(entity, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_id already has a parameter set") from exc
    db.refresh(entity)
    return entity


@router.delete("/topogram/{param_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topogram_param(param_id: int, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.TopogramParam, param_id, "Topogram param not found", db)
    db.delete(entity)
    db.commit()


@router.get("/helical/", response_model=list[schemas.HelicalParam])
def list_helical_params(db: Session = Depends(get_db)):
    return db.query(models.HelicalParam).order_by(models.HelicalParam.id.asc()).all()


@router.get("/helical/{param_id}", response_model=schemas.HelicalParam)
def get_helical_param(param_id: int, db: Session = Depends(get_db)):
    return _get_entity_or_404(models.HelicalParam, param_id, "Helical param not found", db)


@router.post("/helical/", response_model=schemas.HelicalParam, status_code=status.HTTP_201_CREATED)
def create_helical_param(payload: schemas.HelicalParamCreate, db: Session = Depends(get_db)):
    series = _get_series_or_404(payload.series_id, db)
    _require_series_type(series, "helical")
    entity = models.HelicalParam(**payload.model_dump())
    return _save_single_param(db, entity)


@router.put("/helical/{param_id}", response_model=schemas.HelicalParam)
def update_helical_param(param_id: int, payload: schemas.HelicalParamUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.HelicalParam, param_id, "Helical param not found", db)
    updates = payload.model_dump(exclude_unset=True)
    if "series_id" in updates:
        series = _get_series_or_404(updates["series_id"], db)
        _require_series_type(series, "helical")
    for field, value in updates.items():
        setattr(entity, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_id already has a parameter set") from exc
    db.refresh(entity)
    return entity


@router.delete("/helical/{param_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_helical_param(param_id: int, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.HelicalParam, param_id, "Helical param not found", db)
    db.delete(entity)
    db.commit()


@router.get("/axial/", response_model=list[schemas.AxialParam])
def list_axial_params(db: Session = Depends(get_db)):
    return db.query(models.AxialParam).order_by(models.AxialParam.id.asc()).all()


@router.get("/axial/{param_id}", response_model=schemas.AxialParam)
def get_axial_param(param_id: int, db: Session = Depends(get_db)):
    return _get_entity_or_404(models.AxialParam, param_id, "Axial param not found", db)


@router.post("/axial/", response_model=schemas.AxialParam, status_code=status.HTTP_201_CREATED)
def create_axial_param(payload: schemas.AxialParamCreate, db: Session = Depends(get_db)):
    series = _get_series_or_404(payload.series_id, db)
    _require_series_type(series, "axial")
    entity = models.AxialParam(**payload.model_dump())
    return _save_single_param(db, entity)


@router.put("/axial/{param_id}", response_model=schemas.AxialParam)
def update_axial_param(param_id: int, payload: schemas.AxialParamUpdate, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.AxialParam, param_id, "Axial param not found", db)
    updates = payload.model_dump(exclude_unset=True)
    if "series_id" in updates:
        series = _get_series_or_404(updates["series_id"], db)
        _require_series_type(series, "axial")
    for field, value in updates.items():
        setattr(entity, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="series_id already has a parameter set") from exc
    db.refresh(entity)
    return entity


@router.delete("/axial/{param_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_axial_param(param_id: int, db: Session = Depends(get_db)):
    entity = _get_entity_or_404(models.AxialParam, param_id, "Axial param not found", db)
    db.delete(entity)
    db.commit()
