from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.auth_utils import hash_password, verify_password
from backend.database import Base, PROTOTYPE_ADMIN_PASSWORD, _seed_user_management_defaults


class UserSeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionTesting = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_prototype_admin_uses_documented_test_password(self) -> None:
        with self.SessionTesting() as db:
            _seed_user_management_defaults(db)
            admin = db.query(models.UserAccount).filter(models.UserAccount.username == "U0001").one()

            self.assertTrue(verify_password(PROTOTYPE_ADMIN_PASSWORD, admin.password_hash))

    def test_seed_upgrades_only_the_legacy_default_admin_password(self) -> None:
        with self.SessionTesting() as db:
            _seed_user_management_defaults(db)
            admin = db.query(models.UserAccount).filter(models.UserAccount.username == "U0001").one()
            admin.password_hash = hash_password("U0001")
            db.commit()

            _seed_user_management_defaults(db)
            db.refresh(admin)

            self.assertTrue(verify_password(PROTOTYPE_ADMIN_PASSWORD, admin.password_hash))


if __name__ == "__main__":
    unittest.main()
