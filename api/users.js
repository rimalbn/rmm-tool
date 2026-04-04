const prisma = require('./_prisma');
const { fromReq } = require('./_jwt');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  try {
    const user = fromReq(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const admins = await prisma.adminUser.findMany({
        select: { id: true, username: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
      });
      return res.json(admins);
    }

    // All write operations require superadmin
    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin access required' });
    }

    if (req.method === 'POST') {
      const { username, email, password, role } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
      const passwordHash = await bcrypt.hash(password, 10);
      const admin = await prisma.adminUser.create({
        data: { username, email, passwordHash, role: role || 'admin' },
        select: { id: true, username: true, email: true, role: true, createdAt: true }
      });
      return res.status(201).json(admin);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { role, email, password } = req.body;
      // Prevent demoting yourself
      if (id === user.id && role && role !== 'superadmin') {
        return res.status(400).json({ error: 'Cannot demote your own account' });
      }
      const data = {};
      if (role)     data.role  = role;
      if (email)    data.email = email;
      if (password) data.passwordHash = await bcrypt.hash(password, 10);
      const admin = await prisma.adminUser.update({
        where: { id },
        data,
        select: { id: true, username: true, email: true, role: true, createdAt: true }
      });
      return res.json(admin);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      if (id === user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
      await prisma.adminUser.delete({ where: { id } });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Username or email already exists' });
    return res.status(500).json({ error: err.message });
  }
};
