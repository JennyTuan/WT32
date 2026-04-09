from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import json

from ..database import get_db
from .. import models, schemas

router = APIRouter(
    prefix="/corners",
    tags=["corners"],
)

@router.get("/", response_model=schemas.CornerConfig)
def get_active_corner_config(db: Session = Depends(get_db)):
    config = db.query(models.CornerConfig).filter(models.CornerConfig.is_active == True).first()
    if not config:
        # Fallback to the first available config or a default structure
        config = db.query(models.CornerConfig).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Corner configuration not found")
    return config

@router.post("/", response_model=schemas.CornerConfig)
def update_corner_config(config_update: schemas.CornerConfigUpdate, db: Session = Depends(get_db)):
    # For now, we update the active one or create a new active one
    config = db.query(models.CornerConfig).filter(models.CornerConfig.is_active == True).first()
    if not config:
        config = models.CornerConfig(template_name="Custom", is_active=True, config_json="{}")
        db.add(config)
    
    if config_update.template_name is not None:
        config.template_name = config_update.template_name
    if config_update.config_json is not None:
        config.config_json = config_update.config_json
    
    db.commit()
    db.refresh(config)
    return config

@router.get("/templates", response_model=List[schemas.CornerConfig])
def get_corner_templates(db: Session = Depends(get_db)):
    return db.query(models.CornerConfig).all()

@router.post("/reset", response_model=schemas.CornerConfig)
def reset_to_default(db: Session = Depends(get_db)):
    default_config = db.query(models.CornerConfig).filter(models.CornerConfig.template_name == "Default").first()
    if not default_config:
        # Create it if it somehow missing
        default_structure = {
            "corners": {
                "topLeft": [
                    {"key": "patient_name", "label": "姓名", "visible": True},
                    {"key": "patient_id", "label": "ID", "visible": True}
                ],
                "topRight": [
                    {"key": "scan_time", "label": "时间", "visible": True},
                    {"key": "protocol_name", "label": "协议", "visible": True}
                ],
                "bottomLeft": [
                    {"key": "kv", "label": "kV", "visible": True},
                    {"key": "ma", "label": "mA", "visible": True}
                ],
                "bottomRight": [
                    {"key": "series_number", "label": "序列号", "visible": True},
                    {"key": "image_number", "label": "图像号", "visible": True}
                ]
            }
        }
        default_config = models.CornerConfig(
            template_name="Default",
            is_active=False,
            config_json=json.dumps(default_structure)
        )
        db.add(default_config)
        db.commit()
        db.refresh(default_config)

    # Set active
    db.query(models.CornerConfig).update({models.CornerConfig.is_active: False})
    default_config.is_active = True
    db.commit()
    db.refresh(default_config)
    return default_config
