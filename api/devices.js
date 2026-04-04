const prisma = require('./_prisma');
const { fromReq } = require('./_jwt');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  try {
    const user = fromReq(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const { id } = req.query;

      if (id) {
        const device = await prisma.device.findUnique({
          where: { id },
          include: {
            snapshots: { orderBy: { createdAt: 'desc' }, take: 50 },
            tickets: { orderBy: { createdAt: 'desc' }, take: 10 }
          }
        });
        if (!device) return res.status(404).json({ error: 'Not found' });
        return res.json(device);
      }

      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const devices = await prisma.device.findMany({
        include: {
          snapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { tickets: { where: { status: { not: 'closed' } } } } }
        },
        orderBy: { name: 'asc' }
      });

      const withStatus = devices.map(d => ({
        ...d,
        online: d.lastSeen > fiveMinAgo
      }));

      return res.json(withStatus);
    }

    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name required' });

      const agentToken = crypto.randomBytes(32).toString('hex');
      const device = await prisma.device.create({
        data: { name, hostname: name, agentToken }
      });
      return res.status(201).json({ ...device, agentToken });
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { name, owner, location, notes } = req.body;
      const device = await prisma.device.update({
        where: { id },
        data: {
          ...(name     !== undefined && { name }),
          ...(owner    !== undefined && { owner }),
          ...(location !== undefined && { location }),
          ...(notes    !== undefined && { notes })
        }
      });
      return res.json(device);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.deviceSnapshot.deleteMany({ where: { deviceId: id } });
      await prisma.ticket.updateMany({ where: { deviceId: id }, data: { deviceId: null } });
      await prisma.device.delete({ where: { id } });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
