const { Client } = require('pg');
async function run() {
  const c = new Client({ connectionString: 'postgresql://postgres:root@localhost:5432/media_monitor' });
  await c.connect();
  const r = await c.query(
    'SELECT id, type, raw_text, clean_text FROM thread_tweets WHERE root_tweet_id = $1 LIMIT 10',
    ['928119658242129920']
  );
  for (const row of r.rows) {
    console.log(row.type, '|', row.id.slice(-6), '| raw_text len:', (row.raw_text||'').length, '| clean_text len:', (row.clean_text||'').length);
  }
  await c.end();
}
run().catch(console.error);
