const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:root@localhost:5432/media_monitor',
});

async function clean() {
  try {
    const res = await pool.query(`
      DELETE FROM tweets 
      WHERE profile_id = (SELECT id FROM profiles WHERE username ILIKE 'IndianGems_')
      AND (raw_tweet_json->>'username') ILIKE 'IndianGems_' IS FALSE
      RETURNING id;
    `);
    console.log(`Deleted ${res.rowCount} corrupted tweets.`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

clean();
