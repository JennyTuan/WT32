from __future__ import annotations

from pathlib import Path

from backend.database import Base, engine, init_db


def reset_db() -> None:
    db_path = Path(__file__).resolve().parent / "app.db"

    if db_path.exists():
        db_path.unlink()

    Base.metadata.create_all(bind=engine)
    init_db()


if __name__ == "__main__":
    reset_db()
    print("Database reset complete.")
