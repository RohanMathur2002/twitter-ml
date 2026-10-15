const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:root@localhost:5432/media_monitor' });
pool.query("SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = 'tweet_embeddings'::regclass AND i.indisprimary").then(r => console.log(r.rows)).finally(() => pool.end());
