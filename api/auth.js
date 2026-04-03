const prisma = require('./_prisma');
const { sign, fromReq } = require('./_jwt');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Allow unauthenticated check to see if first-time setup is needed
      const user = fromReq(req);
      if (!user) {
        const count = await prisma.adminUser.count();
        if (count === 0) return res.json({ needsSetup: true });
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const admin = await prisma.adminUser.findUnique({ where: { id: user.id } });
      if (!admin) return res.status(401).json({ error: 'User not found' });
      return res.json({ id: admin.id, username: admin.username, email: admin.email });
    }

    if (req.method === 'POST') {
      const { action, username, email, password } = req.body;

      if (action === 'setup') {
        const count = await prisma.adminUser.count();
        if (count > 0) return res.status(403).json({ error: 'Admin already exists' });
        const passwordHash = await bcrypt.hash(password, 10);
        const admin = await prisma.adminUser.create({
          data: { username, email, passwordHash }
        });
        const token = sign({ id: admin.id, username: admin.username });
        return res.json({ token, username: admin.username });
      }

      if (action === 'login') {
        const admin = await prisma.adminUser.findUnique({ where: { username } });
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcrypt.compare(password, admin.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        const token = sign({ id: admin.id, username: admin.username });
        return res.json({ token, username: admin.username });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
