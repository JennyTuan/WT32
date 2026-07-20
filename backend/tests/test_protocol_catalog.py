from __future__ import annotations

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base, get_db
from backend.routers import protocols


class ProtocolCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

        app = FastAPI()
        app.include_router(protocols.router, prefix="/api")
        app.dependency_overrides[get_db] = self._get_db
        self.app = app
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def _get_db(self):
        db = self.session_factory()
        try:
            yield db
        finally:
            db.close()

    @staticmethod
    def _protocol(name: str, *, description: str, is_factory: bool) -> models.Protocol:
        return models.Protocol(
            name=name,
            body_part="head",
            age_group="adult",
            patient_weight="50-90kg",
            patient_position="HFS",
            table_direction="in",
            acquisition_type="regular",
            scan_mode="plain",
            description=description,
            is_factory=is_factory,
        )

    def test_catalog_keeps_builtin_factory_protocols_and_hides_stale_csv_rows(self) -> None:
        db = self.session_factory()
        try:
            db.add_all(
                [
                    self._protocol("Built-in routine", description="Built-in routine seeded protocol", is_factory=True),
                    self._protocol("Custom protocol", description="Custom protocol", is_factory=False),
                    self._protocol("Stale CSV protocol", description="protocol-csv:legacy:stale", is_factory=True),
                ]
            )
            db.commit()
        finally:
            db.close()

        response = self.client.get("/api/protocols/catalog")

        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["name"] for item in response.json()}, {"Built-in routine", "Custom protocol"})


if __name__ == "__main__":
    unittest.main()
