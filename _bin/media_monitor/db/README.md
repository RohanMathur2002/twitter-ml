# Database Layer

This project uses local PostgreSQL with raw SQL migrations.

## Folder Structure

- `db/setup/create_database.sql`: creates the local `media_monitor` database if it does not already exist.
- `db/migrations/001_initial_intelligence_schema.sql`: creates the intelligence-layer schema and enables `pgvector`.

## Local Setup

Run from the project root after copying `.env.mock` values into your real `.env`:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres -f "db/setup/create_database.sql"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -d media_monitor -f "db/migrations/001_initial_intelligence_schema.sql"
```

If your PostgreSQL password is not already available to `psql`, it will prompt you.

## Raw SQL vs Prisma

Raw SQL is the better default for this schema. The project needs `pgvector`, GIN indexes, future HNSW indexes, array columns, JSONB-heavy analytics payloads, and likely partitioning. Prisma can still be added later for application CRUD, but migrations should stay SQL-first so database features remain explicit and production-like.

## Future Partitioning

For very large tweet volume, partition `tweets` by `created_at`, usually monthly or quarterly:

- Keep the logical parent table as `tweets`.
- Create range partitions like `tweets_2026_05`.
- Keep local indexes on each partition for `created_at`, `profile_id`, `lang`, and `hashtags`.
- Consider subpartitioning or BRIN indexes only after measuring query patterns.
- Move old partitions to cheaper storage or read-only maintenance windows when analytics allows it.
