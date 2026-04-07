/**
 * RMM Agent — runs on each monitored device.
 *
 * Usage:
 *   AGENT_TOKEN=<token> RMM_URL=https://your-app.vercel.app node agent.js
 *
 * Or create a .env file in the same directory:
 *   AGENT_TOKEN=<token>
 *   RMM_URL=https://your-app.vercel.app
 *
 * The agent sends a heartbeat every 60 seconds with CPU, RAM, disk, and uptime data.
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// Load .env if present
try {
  const env = fs.readFileSync('.env', 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const AGENT_TOKEN = process.env.AGENT_TOKEN;
const RMM_URL = (process.env.RMM_URL || '').replace(/\/$/, '');
const INTERVAL_MS = 60 * 1000; // 60 seconds

if (!AGENT_TOKEN || !RMM_URL) {
  console.error('ERROR: AGENT_TOKEN and RMM_URL must be set.');
  console.error('Example: AGENT_TOKEN=abc123 RMM_URL=https://your-app.vercel.app node agent.js');
  process.exit(1);
}

function getCpuPercent() {
  // Sample CPU usage over 100ms
  const start = os.cpus().map(c => c.times);
  return new Promise(resolve => {
    setTimeout(() => {
      const end = os.cpus().map(c => c.times);
      const deltas = start.map((s, i) => {
        const e = end[i];
        const idle = e.idle - s.idle;
        const total = Object.values(e).reduce((a, b) => a + b, 0) - Object.values(s).reduce((a, b) => a + b, 0);
        return { idle, total };
      });
      const avgIdle = deltas.reduce((a, b) => a + b.idle, 0) / deltas.length;
      const avgTotal = deltas.reduce((a, b) => a + b.total, 0) / deltas.length;
      const cpuPercent = avgTotal > 0 ? (1 - avgIdle / avgTotal) * 100 : 0;
      resolve(Math.min(100, Math.max(0, cpuPercent)));
    }, 100);
  });
}

function getDiskUsage() {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      const out = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
      let total = 0, free = 0;
      out.split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && !isNaN(parts[1]) && !isNaN(parts[2])) {
          free += parseInt(parts[1]);
          total += parseInt(parts[2]);
        }
      });
      return { diskTotalGb: total / 1e9, diskUsedGb: (total - free) / 1e9 };
    } else {
      const out = execSync("df -k /", { encoding: 'utf8' });
      const lines = out.trim().split('\n');
      const parts = lines[1].trim().split(/\s+/);
      const totalKb = parseInt(parts[1]);
      const availKb = parseInt(parts[3]);
      // Derive used as total-available so all APFS volumes are accounted for,
      // not just the root volume (which misses /System/Volumes/Data etc.)
      return { diskTotalGb: totalKb / 1e6, diskUsedGb: (totalKb - availKb) / 1e6 };
    }
  } catch {
    return { diskTotalGb: null, diskUsedGb: null };
  }
}

function getAccurateRam() {
  const totalMem = os.totalmem();
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      const out = execSync('vm_stat', { encoding: 'utf8' });
      const pageMatch = out.match(/page size of (\d+) bytes/);
      const pageSize = pageMatch ? parseInt(pageMatch[1]) : 16384;
      const parse = key => {
        const m = out.match(new RegExp(key + '[^:]*:\\s+(\\d+)'));
        return m ? parseInt(m[1]) : 0;
      };
      const freePages     = parse('Pages free');
      const inactivePages = parse('Pages inactive');
      const specPages     = parse('Pages speculative');
      const availableBytes = (freePages + inactivePages + specPages) * pageSize;
      return { ramTotalGb: totalMem / 1e9, ramUsedGb: (totalMem - availableBytes) / 1e9 };
    }
    if (platform === 'linux') {
      const out = execSync('cat /proc/meminfo', { encoding: 'utf8' });
      const avail = out.match(/MemAvailable:\s+(\d+)/);
      const availableBytes = avail ? parseInt(avail[1]) * 1024 : os.freemem();
      return { ramTotalGb: totalMem / 1e9, ramUsedGb: (totalMem - availableBytes) / 1e9 };
    }
  } catch {}

  // fallback (Windows or parse failure)
  return { ramTotalGb: totalMem / 1e9, ramUsedGb: (totalMem - os.freemem()) / 1e9 };
}

async function sendHeartbeat() {
  try {
    const cpuPercent = await getCpuPercent();
    const { ramTotalGb, ramUsedGb } = getAccurateRam();
    const { diskTotalGb, diskUsedGb } = getDiskUsage();
    const uptimeSeconds = Math.floor(os.uptime());

    const body = {
      hostname: os.hostname(),
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      ipAddress: getLocalIp(),
      loggedInUser: (() => { try { return os.userInfo().username; } catch { return null; } })(),
      cpuPercent,
      ramUsedGb,
      ramTotalGb,
      diskUsedGb,
      diskTotalGb,
      uptimeSeconds
    };

    const res = await fetch(`${RMM_URL}/api/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Token': AGENT_TOKEN },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
      console.log(`[${ts}] Heartbeat OK — CPU: ${cpuPercent.toFixed(1)}% RAM: ${ramUsedGb.toFixed(1)}/${ramTotalGb.toFixed(1)}GB Disk: ${diskUsedGb ? diskUsedGb.toFixed(1) : '?'}/${diskTotalGb ? diskTotalGb.toFixed(1) : '?'}GB`);
    } else {
      const text = await res.text();
      console.error(`[${new Date().toISOString()}] Heartbeat failed: ${res.status} ${text}`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Heartbeat error: ${e.message}`);
  }
}

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
}

// Node 18+ has native fetch; older versions need node-fetch
if (typeof fetch === 'undefined') {
  console.error('ERROR: Node.js 18+ required (for native fetch). Run: node --version');
  process.exit(1);
}

console.log(`RMM Agent starting — reporting to ${RMM_URL} every ${INTERVAL_MS / 1000}s`);
sendHeartbeat();
setInterval(sendHeartbeat, INTERVAL_MS);
