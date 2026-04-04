const prisma = require('./_prisma');
const { fromReq } = require('./_jwt');

module.exports = async function handler(req, res) {
  try {
    const user = fromReq(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const { id, status, priority } = req.query;

      if (id) {
        const ticket = await prisma.ticket.findUnique({
          where: { id },
          include: {
            device: { select: { id: true, name: true, hostname: true } },
            comments: { orderBy: { createdAt: 'asc' } }
          }
        });
        if (!ticket) return res.status(404).json({ error: 'Not found' });
        return res.json(ticket);
      }

      const where = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;

      const tickets = await prisma.ticket.findMany({
        where,
        include: {
          device: { select: { id: true, name: true, hostname: true } },
          _count: { select: { comments: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(tickets);
    }

    if (req.method === 'POST') {
      const { title, description, priority, status, category, deviceId, assignedTo } = req.body;
      if (!title || !description) return res.status(400).json({ error: 'title and description required' });

      const ticket = await prisma.ticket.create({
        data: {
          title,
          description,
          priority: priority || 'medium',
          status: status || 'open',
          category: category || 'other',
          deviceId: deviceId || null,
          assignedTo: assignedTo || null,
          createdBy: user.username
        }
      });
      return res.status(201).json(ticket);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      const { title, description, status, priority, assignedTo } = req.body;
      const ticket = await prisma.ticket.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status }),
          ...(priority !== undefined && { priority }),
          ...(assignedTo !== undefined && { assignedTo })
        }
      });
      return res.json(ticket);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await prisma.ticketComment.deleteMany({ where: { ticketId: id } });
      await prisma.ticket.delete({ where: { id } });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
