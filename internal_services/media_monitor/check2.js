const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:/Users/Sveltetech/Desktop/MediaMonitor/internal_services/media_monitor/public/IndianGems__tweets.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let totalLines = 0;
  let garbage = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalLines++;
    try {
      const data = JSON.parse(line);
      const rawUser = data.raw_tweet_json?.username;
      
      if (rawUser && rawUser.toLowerCase() !== '@indiangems_') {
        garbage.push(rawUser);
      }
    } catch (e) {
    }
  }

  console.log("Total garbage tweets:", garbage.length);
  console.log("List of garbage usernames:");
  console.log(garbage);
}

processLineByLine();
