const prisma = require('./_prisma');
const { fromReq } = require('./_jwt');

function nextFindingId(existing) {
  const year = new Date().getFullYear();
  const nums = existing
    .filter(f => f.findingId && f.findingId.startsWith(`ITAF-${year}`))
    .map(f => parseInt(f.findingId.split('-')[2]) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `ITAF-${year}-${String(next).padStart(3, '0')}`;
}

const include = {
  history:  { orderBy: { createdAt: 'asc' } },
  comments: { orderBy: { createdAt: 'asc' } },
};

module.exports = async function handler(req, res) {
  try {
    const user = fromReq(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id, action } = req.query;

    // ── GET ──
    if (req.method === 'GET') {
      if (id) {
        const finding = await prisma.auditFinding.findUnique({ where: { id }, include });
        if (!finding) return res.status(404).json({ error: 'Not found' });
        return res.json(finding);
      }
      // nextid preview
      if (action === 'nextid') {
        const all = await prisma.auditFinding.findMany({ select: { findingId: true } });
        return res.json({ nextId: nextFindingId(all) });
      }
      const findings = await prisma.auditFinding.findMany({
        include,
        orderBy: { createdAt: 'desc' },
      });
      return res.json(findings);
    }

    // ── POST — new finding ──
    if (req.method === 'POST') {
      if (action === 'comment') {
        if (!id) return res.status(400).json({ error: 'id required' });
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: 'content required' });
        const comment = await prisma.auditFindingComment.create({
          data: { findingId: id, author: user.username, content: content.trim() },
        });
        // Update updatedAt on finding
        await prisma.auditFinding.update({ where: { id }, data: { updatedAt: new Date() } });
        // Log
        const f = await prisma.auditFinding.findUnique({ where: { id }, select: { title: true } });
        await prisma.auditLog.create({ data: { user: user.username, action: 'Commented', itemTitle: f?.title || '', itemType: 'Finding', itemId: id } });
        return res.status(201).json(comment);
      }

      const { title, riskRating, condition, criteria } = req.body;
      if (!title?.trim())     return res.status(400).json({ error: 'title required' });
      if (!riskRating)        return res.status(400).json({ error: 'riskRating required' });
      if (!condition?.trim()) return res.status(400).json({ error: 'condition required' });
      if (!criteria?.trim())  return res.status(400).json({ error: 'criteria required' });

      const all = await prisma.auditFinding.findMany({ select: { findingId: true } });
      const findingId = nextFindingId(all);

      const finding = await prisma.auditFinding.create({
        data: {
          findingId,
          title:              req.body.title.trim(),
          auditor:            req.body.auditor || user.username,
          date:               req.body.date || null,
          riskRating:         req.body.riskRating,
          condition:          req.body.condition?.trim() || null,
          criteria:           req.body.criteria?.trim() || null,
          cause:              req.body.cause?.trim() || null,
          consequence:        req.body.consequence?.trim() || null,
          correctiveAction:   req.body.correctiveAction?.trim() || null,
          managementResponse: req.body.managementResponse?.trim() || null,
          status:             req.body.status || 'Draft',
          remediationDue:     req.body.remediationDue || null,
          createdBy:          user.username,
        },
        include,
      });

      await prisma.auditLog.create({ data: { user: user.username, action: 'Created', itemTitle: finding.title, itemType: 'Finding', itemId: finding.id } });
      return res.status(201).json(finding);
    }

    // ── PUT — update finding ──
    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });

      const existing = await prisma.auditFinding.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const fields = {
        title: 'Title', riskRating: 'Risk Rating', status: 'Status',
        condition: 'Condition', criteria: 'Criteria', cause: 'Cause',
        consequence: 'Consequence', correctiveAction: 'Corrective Action',
        managementResponse: 'Management Response', remediationDue: 'Due Date', date: 'Date',
      };

      const updates = {};
      const historyEntries = [];

      Object.keys(fields).forEach(k => {
        if (req.body[k] !== undefined && req.body[k] !== existing[k]) {
          historyEntries.push({ field: fields[k], fromVal: existing[k] || null, toVal: req.body[k] || null, user: user.username, findingId: id });
          updates[k] = req.body[k] || null;
        }
      });

      if (Object.keys(updates).length === 0 && historyEntries.length === 0) {
        const unchanged = await prisma.auditFinding.findUnique({ where: { id }, include });
        return res.json(unchanged);
      }

      if (historyEntries.length) {
        await prisma.auditFindingHistory.createMany({ data: historyEntries });
      }

      const updated = await prisma.auditFinding.update({ where: { id }, data: updates, include });
      await prisma.auditLog.create({ data: { user: user.username, action: 'Edited', itemTitle: updated.title, itemType: 'Finding', itemId: id } });
      return res.json(updated);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
