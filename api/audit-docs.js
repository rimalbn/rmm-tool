const prisma = require('./_prisma');
const { fromReq } = require('./_jwt');

const include = { history: { orderBy: { createdAt: 'asc' } } };

module.exports = async function handler(req, res) {
  try {
    const user = fromReq(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id, action } = req.query;

    // ── GET ──
    if (req.method === 'GET') {
      if (id) {
        const doc = await prisma.auditDoc.findUnique({ where: { id }, include });
        if (!doc) return res.status(404).json({ error: 'Not found' });
        return res.json(doc);
      }
      const docs = await prisma.auditDoc.findMany({ include, orderBy: { updatedAt: 'desc' } });
      return res.json(docs);
    }

    // ── POST — create doc ──
    if (req.method === 'POST') {
      const { title, body } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title required' });
      if (!body?.trim())  return res.status(400).json({ error: 'body required' });

      const doc = await prisma.auditDoc.create({
        data: {
          title:          req.body.title.trim(),
          category:       req.body.category || 'Other',
          body:           req.body.body,
          tags:           req.body.tags || [],
          fileAttachment: req.body.fileAttachment || null,
          createdBy:      user.username,
          lastEditedBy:   user.username,
          history: { create: [{ user: user.username, action: 'Created' }] },
        },
        include,
      });

      await prisma.auditLog.create({ data: { user: user.username, action: 'Created', itemTitle: doc.title, itemType: 'Documentation', itemId: doc.id } });
      return res.status(201).json(doc);
    }

    // ── PUT — update / star / pin / view ──
    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });

      const existing = await prisma.auditDoc.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });

      if (action === 'star') {
        const already = existing.starredBy.includes(user.username);
        const starredBy = already
          ? existing.starredBy.filter(u => u !== user.username)
          : [...existing.starredBy, user.username];
        const doc = await prisma.auditDoc.update({ where: { id }, data: { starredBy }, include });
        await prisma.auditLog.create({ data: { user: user.username, action: 'Starred', itemTitle: doc.title, itemType: 'Documentation', itemId: id } });
        return res.json(doc);
      }

      if (action === 'pin') {
        const doc = await prisma.auditDoc.update({ where: { id }, data: { pinned: !existing.pinned }, include });
        await prisma.auditLog.create({ data: { user: user.username, action: 'Pinned', itemTitle: doc.title, itemType: 'Documentation', itemId: id } });
        return res.json(doc);
      }

      if (action === 'view') {
        const doc = await prisma.auditDoc.update({ where: { id }, data: { viewCount: { increment: 1 } }, include });
        return res.json(doc);
      }

      // Full edit
      const { title, body } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title required' });
      if (!body?.trim())  return res.status(400).json({ error: 'body required' });

      const doc = await prisma.auditDoc.update({
        where: { id },
        data: {
          title:          req.body.title.trim(),
          category:       req.body.category || existing.category,
          body:           req.body.body,
          tags:           req.body.tags || existing.tags,
          fileAttachment: req.body.fileAttachment !== undefined ? req.body.fileAttachment : existing.fileAttachment,
          lastEditedBy:   user.username,
          history: { create: [{ user: user.username, action: 'Edited' }] },
        },
        include,
      });

      await prisma.auditLog.create({ data: { user: user.username, action: 'Edited', itemTitle: doc.title, itemType: 'Documentation', itemId: id } });
      return res.json(doc);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
