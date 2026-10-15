-- Run this against the default postgres database as a superuser.
-- Example:
-- psql -U postgres -h localhost -p 5432 -d postgres -f db/setup/create_database.sql

SELECT 'CREATE DATABASE media_monitor'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'media_monitor'
)\gexec
