const { spawn } = require('child_process');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  orange: '\x1b[38;5;208m'
};

const mediaMonitorDir = path.join(__dirname, 'media_monitor');
const mlFastApiDir = path.join(__dirname, 'ml-fastapi');
const nitterDir = path.join(__dirname, '..', 'nitter-dev');

console.log(`${colors.green}=== Starting MediaMonitor Internal Services ===${colors.reset}\n`);

function logWithPrefix(prefix, color, data) {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      // Strip ANSI escape codes to ensure clean regex matching
      const cleanLine = line.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

      // Check if it is a warning message (contains level=warning)
      if (cleanLine.includes('level=warning')) {
        const warningPrefix = prefix.replace('Error', 'Warning').replace('error', 'warning');
        console.log(`${colors.yellow}[${warningPrefix}]${colors.reset} ${line}`);
        return;
      }

      // 1. Check if it's the NitterHealth starting message
      if (cleanLine.includes('[NitterHealth] 🚀 Starting health monitoring')) {
        const message = cleanLine.replace('🚀 ', '');
        console.log(`${colors.gray}${message}${colors.reset}`);
        return;
      }

      // 2. Check if it's the nitter-health API request log
      const match = cleanLine.match(/(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+\/api\/nitter-health\s+(\d+)/i);
      if (match) {
        const statusCode = match[2];
        const isOk = statusCode === '200';
        const logColor = isOk ? colors.gray : colors.red;
        console.log(`${logColor}[Nitter Health] Status: ${statusCode}${colors.reset}`);
        return;
      }

      // 3. TweetService logs
      const tweetServiceMatch = cleanLine.match(/\[TweetService\]\s+Successfully\s+upserted\s+(\d+)\s+tweets\s+for\s+profile\s+ID\s+(\d+)\.?/i);
      if (tweetServiceMatch) {
        const count = tweetServiceMatch[1];
        const profileId = tweetServiceMatch[2];
        console.log(`${color}[Media Monitor Tweet Service]${colors.reset} Upserted ${count} tweets. ID: ${profileId}.`);
        return;
      }

      const tweetServiceSkipMatch = cleanLine.match(/\[TweetService\]\s+Skipping\s+\d+\s+tweets\s+with\s+blank\s+text\s+for\s+embedding\s+generation\.?/i);
      if (tweetServiceSkipMatch) {
        console.log(`${colors.cyan}[Media Monitor]${colors.reset} Skipping tweets without text for ${colors.magenta}embedding generation${colors.reset}.`);
        return;
      }

      // 4. Database logs
      const dbMatch = cleanLine.match(/\[Database\]\s+(?:💾\s+)?Upserted\s+(\d+)\s+tweets\s+for\s+@([^\s()]+)\s+\(total\s+ingested\s+so\s+far:\s+(\d+)\)/i);
      if (dbMatch) {
        const count = dbMatch[1];
        const username = dbMatch[2];
        const total = dbMatch[3];
        console.log(`${color}[Media Monitor DB]${colors.reset} Upserted ${count} tweets for @${username} ${colors.green}(current count: ${total})${colors.reset}`);
        return;
      }

      // 5. Check if it's a JSON event log
      if (cleanLine.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(cleanLine.trim());
          if (parsed.event) {
            const isSuccess = parsed.event.endsWith('_success');
            const eventColor = isSuccess ? colors.green : colors.reset;

            const details = [];
            if (parsed.username) details.push(`${colors.yellow}${parsed.username}${colors.reset}`);
            if (parsed.query) details.push(`query="${colors.cyan}${parsed.query}${colors.reset}"`);
            if (parsed.count !== undefined) details.push(`count=${parsed.count}`);
            if (parsed.page !== undefined) details.push(`page=${parsed.page}`);
            if (parsed.limit !== undefined) details.push(`limit=${parsed.limit}`);
            if (parsed.profileId !== undefined) details.push(`profileId=${parsed.profileId}`);

            const detailsStr = details.length > 0 ? `: ${details.join(' ')}` : '';

            // Force standard prefix and color since these are event logs, not errors
            const finalPrefix = 'Media Monitor';
            const finalColor = colors.cyan;

            console.log(`${finalColor}[${finalPrefix}]${colors.reset} ${eventColor}${parsed.event}${colors.reset}${detailsStr} (${parsed.timestamp})`);
            return;
          }
        } catch (e) { }
      }

      // 6. structlog match for ML API (or other python logs)
      const structlogMatch = cleanLine.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+\[\s*([a-zA-Z]+)\s*\]\s+(.+)$/);
      if (structlogMatch) {
        const timestamp = structlogMatch[1];
        const level = structlogMatch[2].trim();
        const rest = structlogMatch[3].trim();
        const time = timestamp.split(' ')[1];

        // Clean up multiple spaces and empty key= values
        const cleanRest = rest.replace(/\s+/g, ' ')
          .split(' ')
          .filter(part => !part.endsWith('=') && !part.match(/^\w+=$/))
          .join(' ');

        const jobAcceptedMatch = cleanRest.match(/tweet_embedding_job_accepted.*?count=(\d+)/);
        if (jobAcceptedMatch) {
          console.log(`${color}[${prefix}]${colors.reset} Queued ${colors.green}${jobAcceptedMatch[1]} tweets${colors.reset} for ${colors.magenta}embedding generation${colors.reset}.`);
          return;
        }

        const modelLoadingMatch = cleanRest.match(/embedding_model_loading.*?model_name=([^\s]+)/);
        if (modelLoadingMatch) {
          const name = modelLoadingMatch[1];
          console.log(`${colors.magenta}[ML API] ⏳ Loading model: ${colors.yellow}${name}${colors.magenta}...${colors.reset}`);
          return;
        }

        const modelLoadedMatch = cleanRest.match(/embedding_model_loaded.*?model_name=([^\s]+)/);
        if (modelLoadedMatch) {
          const name = modelLoadedMatch[1];
          console.log(`${colors.green}[ML API] 📦 Model Loaded: ${colors.cyan}${name}${colors.green} is ready in memory!${colors.reset}`);
          return;
        }

        const allPreloadedMatch = cleanRest.match(/embedding_models_preloaded/);
        if (allPreloadedMatch) {
          console.log(`\n${colors.green}[ML API] ✅ All configured embedding models are preloaded and ready to use!${colors.reset}\n`);
          return;
        }

        const embeddingsSavedMatch = cleanRest.match(/tweet_embeddings_saved.*?count=(\d+)/);
        if (embeddingsSavedMatch) {
          console.log(`${color}[${prefix}]${colors.reset} Successfully saved embeddings for ${colors.green}${embeddingsSavedMatch[1]} tweets${colors.reset}.`);
          return;
        }

        const batchGeneratedMatch = cleanRest.match(/embedding_batch_generated.*?model_name=([^\s]+).*?progress_count=(\d+).*?total=(\d+)/);
        if (batchGeneratedMatch) {
          const modelName = batchGeneratedMatch[1];
          const progress = batchGeneratedMatch[2];
          const total = batchGeneratedMatch[3];
          console.log(`${color}[${prefix}]${colors.reset} ⚙️ Generating ${colors.cyan}${modelName}${colors.reset} embeddings: ${colors.green}${progress}/${total}${colors.reset}`);
          return;
        }

        if (cleanRest.includes('http_request_completed') && cleanRest.includes('path=/tweets/embed-async')) {
          return;
        }

        const levelColor = level === 'error' ? colors.red : level === 'warning' ? colors.yellow : colors.reset;
        console.log(`${color}[${prefix}]${colors.reset} [${levelColor}${level}${colors.reset}] ${time} | ${cleanRest}`);
        return;
      }

      // 7. uvicorn request logs
      const uvicornMatch = cleanLine.match(/^(?:INFO:\s+)?([^\s]+)\s+-\s+"(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+([^\s]+)\s+HTTP\/[0-9.]+"\s+(\d+)/i);
      if (uvicornMatch) {
        const ip = uvicornMatch[1];
        const method = uvicornMatch[2];
        const reqPath = uvicornMatch[3];
        const status = uvicornMatch[4];

        if (reqPath === '/tweets/embed-async') {
          return;
        }

        console.log(`${color}[${prefix}]${colors.reset} ${method} ${reqPath} ${status}`);
        return;
      }

      // 8. Cron logs
      if (cleanLine.includes('[Cron]')) {
        const cronMsg = cleanLine.substring(cleanLine.indexOf('[Cron]') + 6).trim();
        console.log(`${colors.yellow}[CRON]${colors.reset} ${cronMsg}`);
        return;
      }

      console.log(`${color}[${prefix}]${colors.reset} ${line}`);
    }
  });
}

let nextReady = false;
let mlReady = false;
let mlStartInterval = null;

function checkAllReady() {
  if (nextReady && mlReady) {
    console.log(`\n${colors.green}======================================================${colors.reset}`);
    console.log(`${colors.green}   ALL SERVICES ARE UP AND READY TO USE:              ${colors.reset}`);
    console.log(`${colors.green}   Frontend: http://localhost:3000                    ${colors.reset}`);
    console.log(`${colors.green}   Backend:  http://localhost:8000                    ${colors.reset}`);
    console.log(`${colors.green}======================================================${colors.reset}\n`);
  }
}

// 1. Start Media Monitor (Next.js)
console.log(`${colors.cyan}[System] Starting Media Monitor (Next.js)...${colors.reset}`);
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const nextProcess = spawn(npmCmd, ['run', 'dev'], {
  cwd: mediaMonitorDir,
  env: { ...process.env, PORT: '3000' },
  shell: true
});

nextProcess.stdout.on('data', (data) => {
  const str = data.toString();
  logWithPrefix('Media Monitor', colors.cyan, data);
  if (!nextReady && (str.includes('Ready in') || str.includes('started server on'))) {
    nextReady = true;
    checkAllReady();
  }
});
nextProcess.stderr.on('data', (data) => logWithPrefix('Media Monitor Error', colors.red, data));

// 2. Start ML FastAPI
console.log(`${colors.magenta}[System] Starting ML FastAPI...${colors.reset}`);
let pythonCmd;
let args = [];

if (isWindows) {
  pythonCmd = path.join(mlFastApiDir, 'venv', 'Scripts', 'python.exe');
  args = ['-m', 'uvicorn', 'main:app', '--port', '8000', '--reload'];
} else {
  pythonCmd = path.join(mlFastApiDir, 'venv', 'bin', 'python');
  args = ['-m', 'uvicorn', 'main:app', '--port', '8000', '--reload'];
}

mlStartInterval = setInterval(() => {
  console.log(`${colors.magenta}[ML API]${colors.reset} ML API startup running...`);
}, 2000);

const mlProcess = spawn(pythonCmd, args, {
  cwd: mlFastApiDir,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
});

mlProcess.stdout.on('data', (data) => {
  const str = data.toString();
  if (str.includes('Started server process')) {
    clearInterval(mlStartInterval);
  }
  // Filter noisy uvicorn startup line that appears after the banner
  const filtered = str.split('\n').filter(l => !l.includes('Uvicorn running on')).join('\n');
  if (filtered.trim()) logWithPrefix('ML API', colors.magenta, filtered);

  if (!mlReady && str.includes('embedding_models_preloaded')) {
    mlReady = true;
    checkAllReady();
  }
});
mlProcess.stderr.on('data', (data) => {
  const str = data.toString();
  if (str.includes('Started server process')) {
    clearInterval(mlStartInterval);
  }
  logWithPrefix('ML API Error', colors.yellow, data);
  if (!mlReady && str.includes('embedding_models_preloaded')) {
    mlReady = true;
    checkAllReady();
  }
}); // Uvicorn logs default to stderr

// 3. Stream Nitter Docker Logs
console.log(`${colors.orange}[System] Attaching to Nitter Docker logs...${colors.reset}`);
const nitterProcess = spawn('docker', ['compose', 'logs', '-f', '--tail=0', 'nitter-dev'], {
  cwd: nitterDir,
  shell: true
});

nitterProcess.stdout.on('data', (data) => {
  const str = data.toString();
  // Filter out noisy/empty lines if needed
  if (str.trim()) {
    logWithPrefix('Nitter Docker', colors.orange, data);
  }
});
nitterProcess.stderr.on('data', (data) => {
  if (data.toString().trim()) {
    logWithPrefix('Nitter Error', colors.red, data);
  }
});


// Handle process termination
let isShuttingDown = false;
function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${colors.yellow}[System] Shutting down services...${colors.reset}`);

  if (mlStartInterval) {
    clearInterval(mlStartInterval);
  }

  try {
    nextProcess.kill();
    console.log(`${colors.gray}- Stopped Media Monitor${colors.reset}`);
  } catch (e) { }

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', mlProcess.pid, '/f', '/t']);
    } else {
      mlProcess.kill();
    }
    console.log(`${colors.gray}- Stopped ML FastAPI${colors.reset}`);
  } catch (e) { }

  try {
    nitterProcess.kill();
    console.log(`${colors.gray}- Detached from Nitter logs${colors.reset}`);
  } catch (e) { }

  if (cleanupCronInterval) {
    clearInterval(cleanupCronInterval);
  }

  process.exit(0);
}

// 4. Background Cron Job for Cleanup
console.log(`${colors.yellow}[System] Starting Hourly Cleanup Cron...${colors.reset}`);
const cleanupCronInterval = setInterval(() => {
  if (nextReady) {
    fetch('http://localhost:3000/api/cron/cleanup')
      .then(res => res.json())
      .then(data => {
        if (data.deleted !== undefined) {
          console.log(`${colors.yellow}[CRON]${colors.reset} Cleaned up ${data.deleted} expired cached tweets.`);
        }
      })
      .catch(err => {
        console.error(`${colors.red}[CRON Error]${colors.reset} Failed to trigger cleanup:`, err.message);
      });
  }
}, 60 * 60 * 1000); // Hourly

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

nextProcess.on('exit', (code) => {
  if (!isShuttingDown) {
    console.log(`${colors.red}[System] Media Monitor exited with code ${code}${colors.reset}`);
    cleanup();
  }
});

mlProcess.on('exit', (code) => {
  if (!isShuttingDown) {
    console.log(`${colors.red}[System] ML FastAPI exited with code ${code}${colors.reset}`);
    cleanup();
  }
});

