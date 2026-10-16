/**
 * Automated Migration Runner for MediaMonitor
 * 
 * Safely executes all SQL migrations in ./db/migrations in ascending order.
 * Tracks applied migrations in a dedicated table `schema_migrations_history`
 * so migrations are only executed once.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Attempt to load .env or .env.local if available
const envPath = path.join(__dirname, '.env');
const envLocalPath = path.join(__dirname, '.env.local');

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(envLocalPath);
loadEnvFile(envPath);

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:root@localhost:5432/media_monitor';

const pool = new Pool({
  connectionString: connectionString,
});

async function run() {
  const client = await pool.connect();
  console.log('Connected to PostgreSQL for migrations:', connectionString.replace(/:[^:@]+@/, ':****@'));

  try {
    // 1. Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations_history (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Fetch applied migrations
    const res = await client.query('SELECT filename FROM schema_migrations_history');
    const appliedSet = new Set(res.rows.map(r => r.filename));

    // Check if database was initialized before tracking table existed
    const checkProfiles = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'profiles'
      );
    `);
    const tablesAlreadyExist = checkProfiles.rows[0].exists;

    // 3. Read migration files
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    console.log(`Found ${files.length} migration files in ${migrationsDir}`);

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[SKIPPED] ${file} (already recorded in schema_migrations_history)`);
        continue;
      }

      // If tables already exist and tracking was just created, record past migrations
      if (tablesAlreadyExist && appliedSet.size === 0) {
        console.log(`[INITIAL RECORD] ${file} (marking as already applied on existing schema)`);
        await client.query(
          'INSERT INTO schema_migrations_history (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        continue;
      }

      console.log(`[APPLYING] ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations_history (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[SUCCESS] ${file} applied successfully.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[ERROR] Failed to apply ${file}:`, err.message);
        throw err;
      }
    }

    console.log('\nAll database migrations are up to date!');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal migration runner error:', err);
  process.exit(1);
});
