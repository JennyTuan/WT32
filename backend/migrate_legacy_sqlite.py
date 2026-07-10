from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from sqlalchemy import MetaData, create_engine, func, inspect, select, text
from sqlalchemy.engine import Connection, Engine

from . import models  # noqa: F401  # 确保 Base.metadata 包含全部业务表。
from .database import Base, SQLALCHEMY_DATABASE_URL, assert_database_current


def _source_engine(source_path: Path) -> Engine:
    resolved_path = source_path.expanduser().resolve()
    if not resolved_path.is_file():
        raise FileNotFoundError(f"SQLite 源数据库不存在：{resolved_path}")
    return create_engine(f"sqlite:///{resolved_path.as_posix()}")


def _target_is_empty(connection: Connection, table_names: Iterable[str]) -> bool:
    metadata = MetaData()
    metadata.reflect(bind=connection, only=list(table_names))
    return all(
        connection.execute(select(func.count()).select_from(metadata.tables[name])).scalar_one()
        == 0
        for name in table_names
    )


def _reset_postgresql_sequences(connection: Connection) -> None:
    if connection.dialect.name != "postgresql":
        return

    # 迁移显式主键后同步 SERIAL/IDENTITY 序列，避免后续新增记录主键冲突。
    for table in Base.metadata.sorted_tables:
        for column in table.primary_key.columns:
            if len(table.primary_key.columns) != 1:
                continue
            sequence_name = connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table.name, "column_name": column.name},
            ).scalar_one_or_none()
            if not sequence_name:
                continue
            max_value = connection.execute(select(func.max(column))).scalar_one_or_none()
            if max_value is not None:
                connection.execute(
                    text("SELECT setval(CAST(:sequence_name AS regclass), :value, true)"),
                    {"sequence_name": sequence_name, "value": max_value},
                )


def migrate_legacy_sqlite(
    source_path: Path,
    target_engine: Engine,
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    source_engine = _source_engine(source_path)
    try:
        assert_database_current(target_engine)
        source_metadata = MetaData()
        source_metadata.reflect(bind=source_engine)

        target_table_names = [table.name for table in Base.metadata.sorted_tables]
        missing_tables = [name for name in target_table_names if name not in source_metadata.tables]
        if missing_tables:
            raise RuntimeError(
                "SQLite 源数据库缺少业务表：" + ", ".join(sorted(missing_tables))
            )

        with target_engine.begin() as target_connection:
            existing_target_tables = set(inspect(target_connection).get_table_names())
            missing_target_tables = set(target_table_names) - existing_target_tables
            if missing_target_tables:
                raise RuntimeError(
                    "目标数据库尚未完成 Alembic 迁移，缺少表："
                    + ", ".join(sorted(missing_target_tables))
                )
            if not _target_is_empty(target_connection, target_table_names):
                raise RuntimeError("目标数据库已有业务数据；为避免重复写入，迁移已停止。")

            copied_counts: dict[str, int] = {}
            with source_engine.connect() as source_connection:
                for target_table in Base.metadata.sorted_tables:
                    source_table = source_metadata.tables[target_table.name]
                    shared_columns = [
                        column.name
                        for column in target_table.columns
                        if column.name in source_table.columns
                    ]
                    rows = [
                        dict(row._mapping)
                        for row in source_connection.execute(
                            select(*(source_table.c[name] for name in shared_columns))
                        )
                    ]
                    if rows and not dry_run:
                        target_connection.execute(target_table.insert(), rows)
                    copied_counts[target_table.name] = len(rows)

            if not dry_run:
                _reset_postgresql_sequences(target_connection)

        return copied_counts
    finally:
        source_engine.dispose()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="将 WT32 旧 SQLite 业务数据复制到已迁移的目标数据库。"
    )
    parser.add_argument(
        "--source",
        required=True,
        type=Path,
        help="旧 SQLite 数据库文件路径，例如 backend/app.db",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只校验源库、目标库和记录数，不写入数据",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    target_engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
    try:
        copied_counts = migrate_legacy_sqlite(
            args.source,
            target_engine,
            dry_run=args.dry_run,
        )
    finally:
        target_engine.dispose()

    total_rows = sum(copied_counts.values())
    non_empty_tables = sum(count > 0 for count in copied_counts.values())
    action = "校验" if args.dry_run else "迁移"
    print(f"{action}完成：{total_rows} 行，{non_empty_tables} 张非空业务表。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
