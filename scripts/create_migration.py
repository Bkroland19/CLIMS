#!/usr/bin/env python3
"""Create a sequential SQL migration pair with the project's pinned migrate CLI."""

import argparse
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def create_migration(name, directory=None, permissions=()):
    if not name or not re.fullmatch(r"[a-z][a-z0-9]*(?:_[a-z0-9]+)*", name):
        raise ValueError(
            "Use a lowercase snake_case name, e.g. make migrate-create NAME=add_stock_index"
        )
    backend = ROOT / "backend"
    match = re.search(
        r"^\s*github\.com/golang-migrate/migrate/v4\s+(v[0-9]+\.[0-9]+\.[0-9]+)\s*$",
        (backend / "go.mod").read_text(),
        re.MULTILINE,
    )
    if not match:
        raise ValueError("Cannot find the pinned golang-migrate version in backend/go.mod")
    destination = directory if directory is not None else backend / "internal/database/migrations"
    if not destination.is_dir():
        raise ValueError("The migrations directory must already exist")
    sql = permission_sql(permissions) if permissions else None
    existing = set(destination.glob(f"*_{name}.*.sql")) if sql else set()
    subprocess.run(
        [
            "go",
            "run",
            "-tags",
            "postgres",
            f"github.com/golang-migrate/migrate/v4/cmd/migrate@{match[1]}",
            "create",
            "-ext",
            "sql",
            "-dir",
            str(destination),
            "-seq",
            "-digits",
            "6",
            name,
        ],
        cwd=backend,
        check=True,
    )

    if sql:
        created = set(destination.glob(f"*_{name}.*.sql")) - existing
        if len(created) != 2:
            raise ValueError("Could not identify the new permission migration pair")
        for path in created:
            path.write_text(sql[0 if path.name.endswith(".up.sql") else 1], encoding="utf-8")


def permission_sql(entries):
    def literal(value):
        return "'" + value.replace("'", "''") + "'"

    names = set()
    values = []
    for name, description in entries:
        description = description.strip()
        if not re.fullmatch(r"[a-z][a-z0-9_]*:[a-z][a-z0-9_]*", name):
            raise ValueError(f"Invalid permission code {name!r}. Use resource:action.")
        if name in names:
            raise ValueError(f"Duplicate permission code: {name}")
        if not description or any(ord(character) < 32 for character in description):
            raise ValueError(f"Provide a single-line description for {name}")
        names.add(name)
        values.append(f"    ({literal(name)}, {literal(description)})")

    rows = ",\n".join(values)
    codes = ", ".join(literal(name) for name, _ in entries)
    up = f"""BEGIN;
SET LOCAL standard_conforming_strings = on;

WITH added AS (
    INSERT INTO permissions (name, description) VALUES
{rows}
    RETURNING id
)
INSERT INTO role_permission (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'admin'), added.id FROM added;

COMMIT;
"""
    down = f"""BEGIN;

DELETE FROM permissions WHERE name IN ({codes});

COMMIT;
"""
    return up, down


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", nargs="?", default=os.getenv("MIGRATION_NAME"))
    parser.add_argument("--permission", nargs=2, action="append", metavar=("CODE", "DESCRIPTION"))
    args = parser.parse_args()
    try:
        create_migration(args.name, permissions=args.permission)
    except (ValueError, FileNotFoundError) as error:
        parser.error(str(error))
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from error


if __name__ == "__main__":
    main()
