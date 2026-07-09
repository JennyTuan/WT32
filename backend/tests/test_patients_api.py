from __future__ import annotations

import unittest
import warnings
from datetime import date

warnings.filterwarnings(
    "ignore",
    message=r".*asyncio\.iscoroutinefunction.*",
    category=DeprecationWarning,
)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.routers import patients


class PatientsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        warnings.filterwarnings(
            "ignore",
            message=r".*asyncio\.iscoroutinefunction.*",
            category=DeprecationWarning,
        )
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionTesting = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

        self.app = FastAPI()
        self.app.include_router(patients.router, prefix="/api")
        self.app.dependency_overrides[get_db] = self._override_get_db
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def _override_get_db(self):
        db = self.SessionTesting()
        try:
            yield db
        finally:
            db.close()

    def _expected_age(self, birth_date: date) -> int:
        today = date.today()
        age = today.year - birth_date.year
        if (today.month, today.day) < (birth_date.month, birth_date.day):
            age -= 1
        return max(0, age)

    def test_create_patient_accepts_required_age_without_birth_date(self) -> None:
        response = self.client.post(
            "/api/patients/",
            json={
                "last_name": "Li",
                "first_name": "Lei",
                "patient_id": "P-AGE-001",
                "gender": "male",
                "age": 42,
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["age"], 42)
        self.assertIsNone(body["birth_date"])
        self.assertEqual(body["name"], "LiLei")

    def test_create_patient_refreshes_age_from_optional_birth_date(self) -> None:
        birth_date = date(2000, 7, 8)
        response = self.client.post(
            "/api/patients/",
            json={
                "last_name": "Wang",
                "first_name": "Mei",
                "patient_id": "P-AGE-002",
                "gender": "female",
                "age": 99,
                "birth_date": birth_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["age"], self._expected_age(birth_date))
        self.assertEqual(body["birth_date"], birth_date.isoformat())

    def test_create_patient_requires_age(self) -> None:
        response = self.client.post(
            "/api/patients/",
            json={
                "last_name": "Zhang",
                "first_name": "San",
                "patient_id": "P-AGE-003",
                "gender": "male",
            },
        )

        self.assertEqual(response.status_code, 422, response.text)

    def test_update_age_does_not_infer_birth_date_but_birth_date_refreshes_age(self) -> None:
        create_response = self.client.post(
            "/api/patients/",
            json={
                "last_name": "Chen",
                "first_name": "Min",
                "patient_id": "P-AGE-004",
                "gender": "female",
                "age": 35,
            },
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        patient_id = create_response.json()["id"]

        age_response = self.client.put(f"/api/patients/{patient_id}", json={"age": 36})
        self.assertEqual(age_response.status_code, 200, age_response.text)
        age_body = age_response.json()
        self.assertEqual(age_body["age"], 36)
        self.assertIsNone(age_body["birth_date"])

        birth_date = date(2010, 7, 9)
        birth_response = self.client.put(
            f"/api/patients/{patient_id}",
            json={"age": 99, "birth_date": birth_date.isoformat()},
        )
        self.assertEqual(birth_response.status_code, 200, birth_response.text)
        birth_body = birth_response.json()
        self.assertEqual(birth_body["age"], self._expected_age(birth_date))
        self.assertEqual(birth_body["birth_date"], birth_date.isoformat())


if __name__ == "__main__":
    unittest.main()
