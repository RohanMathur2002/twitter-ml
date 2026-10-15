const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:/Users/Sveltetech/Desktop/MediaMonitor/internal_services/media_monitor/public/IndianGems__tweets.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let totalLines = 0;
  let rootUsernames = {};
  let rawUsernames = {};
  let nullTweets = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalLines++;
    try {
      const data = JSON.parse(line);
      const rootUser = data.username;
      rootUsernames[rootUser] = (rootUsernames[rootUser] || 0) + 1;
      
      const rawUser = data.raw_tweet_json?.username;
      if (rawUser) {
        rawUsernames[rawUser] = (rawUsernames[rawUser] || 0) + 1;
      } else {
        nullTweets++;
      }
    } catch (e) {
      console.error("Error parsing line", totalLines, e);
    }
  }

  console.log("Total Lines:", totalLines);
  console.log("Root Usernames distribution:");
  console.log(rootUsernames);
  
  const rawUserKeys = Object.keys(rawUsernames);
  console.log(`Raw Usernames count: ${rawUserKeys.length} different users.`);
  
  // Show top 10 raw usernames
  const sortedRaw = Object.entries(rawUsernames).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log("Top 10 Raw Usernames:");
  console.log(sortedRaw);
  
  console.log("Tweets with no raw_tweet_json.username:", nullTweets);
}

processLineByLine();
