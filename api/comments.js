const prisma = require('./_prisma');
const { fromReq } = require('./_jwt');

module.exports = async function handler(req, res) {
  try {
    const user = fromReq(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { ticketId, content, type } = req.body;
      if (!ticketId || !content) return res.status(400).json({ error: 'ticketId and content required' });

      const comment = await prisma.ticketComment.create({
        data: { ticketId, content, authorName: user.username, type: type || 'note' }
      });
      return res.status(201).json(comment);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
