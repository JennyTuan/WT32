from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from . import models


def load_document(db: Session, key: str, default: Any) -> Any:
    row = db.get(models.PersistentDocument, key)
    if row is None:
        return default
    return json.loads(row.payload)


def save_document(db: Session, key: str, payload: Any) -> None:
    serialized = json.dumps(payload, ensure_ascii=False)
    row = db.get(models.PersistentDocument, key)
    if row is None:
        db.add(models.PersistentDocument(key=key, payload=serialized))
    else:
        row.payload = serialized
        row.updated_at = datetime.now(timezone.utc)
    db.commit()
