const http = require('http');
const net = require('net');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROXIES_FILE = path.join(__dirname, 'proxies.json');
const PORT = process.env.PROXY_ROTATOR_PORT || 8088;
const MAX_ATTEMPTS = 3;

let proxies = [];
try {
  const data = JSON.parse(fs.readFileSync(PROXIES_FILE, 'utf8'));
  proxies = data.proxies || [];
} catch (err) {
  console.error(`[Rotator Error] Could not load ${PROXIES_FILE}:`, err.message);
  process.exit(1);
}

if (proxies.length === 0) {
  console.error(`[Rotator Error] No proxies found in ${PROXIES_FILE}`);
  process.exit(1);
}

let currentIndex = 0;

function getNextProxy() {
  const proxyStr = proxies[currentIndex % proxies.length];
  const proxyNum = (currentIndex % proxies.length) + 1;
  currentIndex++;

  const parsed = new url.URL(proxyStr);
  const host = parsed.hostname;
  const port = parseInt(parsed.port, 10) || 80;
  let username = decodeURIComponent(parsed.username || '');
  const password = decodeURIComponent(parsed.password || '');

  // Generate a fresh random 8-character session ID for NSTProxy on every request
  // so expired static sticky sessions never fail with '403 desc = no proxy' or '502'
  const freshSessionId = crypto.randomBytes(4).toString('hex');
  if (username.includes('-s_')) {
    username = username.replace(/-s_[A-Za-z0-9]+/, `-s_${freshSessionId}`);
  } else {
    username = `${username}-s_${freshSessionId}`;
  }

  const auth = username ? `${username}:${password}` : '';
  const authHeader = auth ? 'Basic ' + Buffer.from(auth).toString('base64') : '';

  return { host, port, authHeader, proxyNum, freshSessionId };
}

const server = http.createServer((req, res) => {
  const proxy = getNextProxy();
  console.log(`[Rotator] HTTP ${req.method} ${req.url} -> Proxy #${proxy.proxyNum} (session: ${proxy.freshSessionId})`);

  const options = {
    hostname: proxy.host,
    port: proxy.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers }
  };

  if (proxy.authHeader) {
    options.headers['Proxy-Authorization'] = proxy.authHeader;
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Rotator Error] HTTP request failed via Proxy #${proxy.proxyNum}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  });

  req.pipe(proxyReq);
});

// Handle HTTPS CONNECT tunnel requests with automatic failover & fresh dynamic session IDs
server.on('connect', (req, clientSocket, head) => {
  let attempt = 0;

  function tryProxyConnect() {
    attempt++;
    if (attempt > MAX_ATTEMPTS || clientSocket.destroyed) {
      if (!clientSocket.destroyed) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      }
      return;
    }

    const proxy = getNextProxy();
    console.log(`[Rotator] CONNECT ${req.url} (Attempt ${attempt}/${MAX_ATTEMPTS}) -> Proxy #${proxy.proxyNum} (session: ${proxy.freshSessionId})`);

    const proxySocket = net.connect(proxy.port, proxy.host, () => {
      let connectReq = `CONNECT ${req.url} HTTP/1.1\r\n` +
        `Host: ${req.url}\r\n`;
      if (proxy.authHeader) {
        connectReq += `Proxy-Authorization: ${proxy.authHeader}\r\n`;
      }
      connectReq += `\r\n`;

      proxySocket.write(connectReq);
      if (head && head.length > 0) {
        proxySocket.write(head);
      }
    });

    let connected = false;
    let headerBuffer = '';

    proxySocket.on('data', (chunk) => {
      if (!connected) {
        headerBuffer += chunk.toString('utf8');
        const headerEnd = headerBuffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const firstLine = headerBuffer.split('\r\n')[0];
          if (firstLine.includes('200')) {
            connected = true;
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

            const leftover = chunk.slice(Buffer.from(headerBuffer.substring(0, headerEnd + 4)).length);
            if (leftover.length > 0) {
              clientSocket.write(leftover);
            }
            proxySocket.pipe(clientSocket);
            clientSocket.pipe(proxySocket);
          } else {
            console.warn(`[Rotator Warning] Proxy #${proxy.proxyNum} rejected CONNECT (${firstLine}). Retrying with next fresh session...`);
            proxySocket.destroy();
            tryProxyConnect();
          }
        }
      }
    });

    proxySocket.on('error', (err) => {
      console.warn(`[Rotator Warning] Proxy #${proxy.proxyNum} connection error (${err.message}). Retrying...`);
      proxySocket.destroy();
      tryProxyConnect();
    });

    clientSocket.on('error', () => {
      proxySocket.destroy();
    });
  }

  tryProxyConnect();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Nitter Proxy Rotator active on http://0.0.0.0:${PORT}`);
  console.log(`Loaded ${proxies.length} proxies with DYNAMIC NSTProxy session generation & automatic failover.`);
});
