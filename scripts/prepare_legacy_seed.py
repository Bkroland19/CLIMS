#!/usr/bin/env python3
"""Stream the historical backup into the current UUID schema."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
schema = (ROOT / "backend/internal/database/migrations/000001_init_schema.up.sql").read_text()
seed = (ROOT / "infra/database/clims_postgres_seed.sql").read_text()

print("BEGIN;")
print("SET LOCAL standard_conforming_strings = on;")
print(
    re.sub(
        r"^CREATE TABLE (.*?^\));",
        r"CREATE TEMP TABLE \1 ON COMMIT DROP;",
        schema,
        flags=re.M | re.S,
    )
)
for line in seed.splitlines():
    if line.startswith("INSERT INTO "):
        print(line)

for match in re.finditer(r'^CREATE TABLE "(\w+)" \(\n(.*?)\n\);', schema, re.M | re.S):
    table, definition = match.groups()
    columns = re.findall(r'^  "(\w+)" ', definition, re.M)
    numeric_id = bool(re.search(r'^  "id" (?:bigint|int) ', definition, re.M))
    targets = []
    values = []
    for column in columns:
        if table == "users" and column == "role":
            continue
        if column == "id" and numeric_id:
            targets.append("legacy_id")
            values.append("source.id::text")
            continue
        targets.append(f'"{column}"')
        value = f'source."{column}"'
        if table == "notifications" and column == "id":
            value += "::uuid"
        values.append(value)
    # Archived source tables; migrations 6 and 16 replaced the originals.
    target_table = {"orders": "legacy_orders", "hot_spots": "legacy_hot_spots"}.get(table, table)
    target_list = ", ".join(targets)
    value_list = ", ".join(values)
    conflict = " ON CONFLICT (legacy_id) DO NOTHING" if table == "roles" else ""
    # Oldest first, so the oldest account keeps a username or phone number others share.
    order = " ORDER BY source.id" if table == "users" else ""
    print(
        f'INSERT INTO public."{target_table}" ({target_list}) '
        f'SELECT {value_list} FROM pg_temp."{table}" source{order}{conflict};'
    )

print(
    """INSERT INTO public.role_user (user_id, role_id)
SELECT u.id, r.id FROM pg_temp.users source
JOIN public.users u ON u.legacy_id = source.id::text
JOIN public.roles r ON r.legacy_id = source.role;
SELECT public.import_legacy_hot_spots();
COMMIT;"""
)
