const prisma = require('./_prisma');

// Called by the agent script running on each monitored device.
// Auth: X-Agent-Token header (the device's unique token).
module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const agentToken = req.headers['x-agent-token'];
    if (!agentToken) return res.status(401).json({ error: 'Missing X-Agent-Token header' });

    const device = await prisma.device.findUnique({ where: { agentToken } });
    if (!device) return res.status(401).json({ error: 'Unknown agent token' });

    const { hostname, os, ipAddress, cpuPercent, ramUsedGb, ramTotalGb, diskUsedGb, diskTotalGb, uptimeSeconds } = req.body;

    // Update device metadata + last seen
    await prisma.device.update({
      where: { id: device.id },
      data: {
        hostname: hostname || device.hostname,
        os: os || device.os,
        ipAddress: ipAddress || device.ipAddress,
        lastSeen: new Date(),
        online: true
      }
    });

    // Record health snapshot
    await prisma.deviceSnapshot.create({
      data: {
        deviceId: device.id,
        cpuPercent: cpuPercent ?? null,
        ramUsedGb: ramUsedGb ?? null,
        ramTotalGb: ramTotalGb ?? null,
        diskUsedGb: diskUsedGb ?? null,
        diskTotalGb: diskTotalGb ?? null,
        uptimeSeconds: uptimeSeconds ?? null
      }
    });

    // Prune snapshots older than 24 hours to keep DB small
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.deviceSnapshot.deleteMany({
      where: { deviceId: device.id, createdAt: { lt: cutoff } }
    });

    return res.json({ ok: true, deviceId: device.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
