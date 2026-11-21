# PostgreSQL and legacy imports

[Documentation index](README.md)

To generate new up/down SQL files, see [creating PostgreSQL migrations](migrations.md). Use `make migrate-create NAME=description`; the historical dump converter below is separate.

## Import the legacy data

`infra/compose/clims_dump_11Nov2026.sql` is the original MySQL dump and must not be run against PostgreSQL. The converted PostgreSQL data is `infra/database/clims_postgres_seed.sql`. Schema and data are separate so normal startup creates an empty database without loading legacy accounts or tokens.

After the backend has applied migrations, import the backup once into a database with no application records apart from the seeded role and permission catalogs.

```sh
make db-seed
```

The import stages the historical SQL in temporary tables and transfers the rows into the UUID schema in one transaction. Source IDs survive in nullable text `legacy_id` columns for historical lookups. Existing references in dormant legacy tables retain their source values and resolve through those columns. User role assignments are translated to UUIDs during import. Existing passwords and the original account email rules are preserved.

Migration 4 promotes existing RBAC UUIDs and converts the imported application tables to UUID primary keys. Numeric-subject JWTs expire at cutover and users must sign in again. Take a database backup before applying migration 4. Restoring it is the rollback path.

The source and converted dump contain account data and access tokens; keep them within the same access boundary as the database backup.

For a database outside Compose, apply the schema migration first (or start the API against that database), then import:

```sh
seed_file=$(mktemp)
trap 'rm -f "$seed_file"' EXIT
python3 scripts/prepare_legacy_seed.py > "$seed_file" &&
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$seed_file"
```

The conversion is reproducible:

```sh
make sql-convert
```

This regenerates migration 1, its rollback, the PostgreSQL seed, and `infra/database/seed_manifest.json` from the original dump. Do not regenerate already deployed migrations after changing the source dump; add a new migration instead. The converter targets the syntax in this specific backup and rejects unsupported table definitions and INSERT formats.

## Hotspot conversion

Migration 16 reshapes `hot_spots` in place, so references from orders, inventory and users keep their UUIDs. Every earlier row is archived unchanged in `legacy_hot_spots`, including hotspots submitted through migrations 8 and 9. The legacy importer writes there too. `import_legacy_hot_spots()` converts the archive and runs both in migration 16 and at the end of `make db-seed`. It only converts rows that have not been converted yet.

The conversion:

- gives legacy hotspots review status `active` when their status was active, and `deactivated` otherwise
- maps earlier submissions: `verified` becomes `submitted`, and a `rejection_reason` becomes the DCFP's `rejected` comment
- matches the legacy district by DHIS2 UID or name, and the subcounty (legacy `division`) only when exactly one subcounty in that district fits
- parses GPS strings and normalises dispenser yes/no spellings
- moves the contact person and comment into `contact_persons` and `hot_spot_comments`
- records the legacy `entered_by` user as `submitted_by_id`

Most legacy hotspots record no subcounty, so the `hot_spot_cleanup` view lists converted legacy hotspots missing a district, subcounty, name or GPS, alongside the original district, subcounty and village text. To export it:

```sh
docker compose --env-file infra/env/dev.env -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.dev.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\copy (SELECT * FROM hot_spot_cleanup) TO STDOUT CSV HEADER"' \
  > hot_spot_cleanup.csv
```

With the supplied backup, 17,991 of 18,221 hotspots get a district and 2,229 get a subcounty.

## Verify the historical dump conversion

To verify without touching the application's database, start an isolated PostgreSQL container:

```sh
docker run -d --rm --name clims-postgres-validation \
  -e POSTGRES_PASSWORD=validation_only -e POSTGRES_DB=clims_validation \
  -v "$PWD:/workspace:ro" postgres:16-alpine
# Wait until this succeeds:
docker exec clims-postgres-validation pg_isready -U postgres -d clims_validation

docker exec clims-postgres-validation psql -U postgres -d clims_validation \
  -v ON_ERROR_STOP=1 -1 \
  -f /workspace/backend/internal/database/migrations/000001_init_schema.up.sql

docker exec clims-postgres-validation psql -U postgres -d clims_validation \
  -v ON_ERROR_STOP=1 -f /workspace/infra/database/clims_postgres_seed.sql

python3 scripts/verify_postgres.py clims-postgres-validation

docker stop clims-postgres-validation
```

The verifier compares every imported column value with the original dump and checks that generated IDs exceed the imported IDs. It consumes one sequence value per identity table; use it on a disposable validation database.

The PostgreSQL conversion uses [PostgreSQL 16 identity columns](https://www.postgresql.org/docs/16/sql-createtable.html). The JWT middleware uses the [official Fiber v3 module](https://docs.gofiber.io/contrib/jwt/).

To smoke-test authentication against a disposable running stack (creates a test account):

```sh
python3 scripts/smoke_api.py http://localhost:8080
```
