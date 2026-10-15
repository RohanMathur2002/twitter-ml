const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:root@localhost:5432/media_monitor';
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Connected to PostgreSQL database.');

  const username = 'narendramodi';
  const cutoffDate = '2026-01-01';

  // 1. Find profile ID
  const profileRes = await client.query(
    'SELECT id, username, display_name FROM profiles WHERE lower(username) = lower($1) LIMIT 1',
    [username]
  );

  if (profileRes.rows.length === 0) {
    console.error(`Profile @${username} not found in database.`);
    await client.end();
    return;
  }

  const profile = profileRes.rows[0];
  console.log(`Found profile: @${profile.username} (ID: ${profile.id})`);

  // 2. Fetch all tweets/replies before 2026-01-01
  const selectRes = await client.query(
    `
      SELECT *
      FROM tweets
      WHERE profile_id = $1 AND created_at < $2::date
      ORDER BY created_at DESC
    `,
    [profile.id, cutoffDate]
  );

  const tweetsToArchive = selectRes.rows;
  console.log(`Found ${tweetsToArchive.length} tweets/replies before ${cutoffDate}.`);

  if (tweetsToArchive.length === 0) {
    console.log('No tweets to archive or delete. Exiting.');
    await client.end();
    return;
  }

  // 3. Save to file in the project directory
  const filename = `${username}_tweets_before_${cutoffDate}.json`;
  const filepath = path.join(__dirname, filename);

  fs.writeFileSync(filepath, JSON.stringify(tweetsToArchive, null, 2), 'utf-8');
  console.log(`✅ Successfully backed up ${tweetsToArchive.length} tweets/replies to: ${filepath}`);

  // 4. Delete those tweets from PostgreSQL
  const deleteRes = await client.query(
    `
      DELETE FROM tweets
      WHERE profile_id = $1 AND created_at < $2::date
    `,
    [profile.id, cutoffDate]
  );

  console.log(`🗑️ Successfully deleted ${deleteRes.rowCount} tweets/replies before ${cutoffDate} from database.`);

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
