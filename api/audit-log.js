const prisma = require('./_prisma');
const { fromReq } = require('./_jwt');

module.exports = async function handler(req, res) {
  try {
    const user = fromReq(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const log = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2000,
      });
      return res.json(log);
    }

    if (req.method === 'POST') {
      const { action, itemTitle, itemType, itemId } = req.body;
      if (!action || !itemTitle || !itemType) return res.status(400).json({ error: 'action, itemTitle, itemType required' });
      const entry = await prisma.auditLog.create({
        data: { user: user.username, action, itemTitle, itemType, itemId: itemId || '' },
      });
      return res.status(201).json(entry);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
