// POST /api/review { name, action: 'approve'|'deny'|'reopen', reason? }
import { handler, validateName, requireFields } from './_handler.js';
import { moveToTrash } from './_trash-util.js';
import { auditLog } from './_audit.js';

const ACTIONS = ['approve', 'deny', 'reopen'];

export default handler({ method: 'POST' }, async ({ res, token, config, branch, body, paths, gh, ip_hash }) => {
  const err = requireFields(body, ['name', 'action']);
  if (err) return res.status(400).json({ error: err });
  if (!validateName(body.name)) return res.status(400).json({ error: 'invalid name' });
  if (!ACTIONS.includes(body.action)) return res.status(400).json({ error: 'action must be approve|deny|reopen' });
  if (body.action === 'deny' && (!body.reason || typeof body.reason !== 'string' || body.reason.length > 500)) {
    return res.status(400).json({ error: 'reason required for deny (1-500 chars)' });
  }

  const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
  const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
  const item = json.items.find(i => i.name === body.name);
  if (!item) return res.status(404).json({ error: 'item not found' });
  if (!['waiting-for-review', 'approved', 'denied'].includes(item.status)) {
    return res.status(400).json({ error: 'item must have an uploaded file to review' });
  }

  const prevStatus = item.status;
  item.status = body.action === 'approve' ? 'approved' : body.action === 'deny' ? 'denied' : 'waiting-for-review';
  if (body.action === 'deny') item.denyReason = body.reason;
  else delete item.denyReason;

  // On approve: copy uploaded file to runtime dir (as-is, no split)
  if (body.action === 'approve' && item.uploadedFile) {
    const runtimeDir = (config.sources || []).find(s => /in.?game|runtime/i.test(s.category || ''))?.dir
      || (config.sources || [])[0]?.dir;
    if (runtimeDir) {
      const ext = (item.uploadedFile.split('.').pop() || 'png').toLowerCase();
      const runtimePath = `${runtimeDir}/${item.name}.${ext}`;
      try {
        const uploadPath = `${paths.uploadPrefix}/${item.uploadedFile}`;
        const up = await gh(token, uploadPath, { ref: branch, github: config.github });
        let content = up.content;
        if (!content) {
          const blob = await fetch(`https://api.github.com/repos/${config.github.owner}/${config.github.repo}/git/blobs/${up.sha}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
          }).then(r => r.json());
          content = blob.content;
        }
        let existingSha;
        try { existingSha = (await gh(token, runtimePath, { ref: branch, github: config.github })).sha; } catch {}
        await gh(token, runtimePath, {
          method: 'PUT', github: config.github,
          body: { message: `approve: copy ${item.name} to runtime`, content, branch, ...(existingSha ? { sha: existingSha } : {}) },
        });
      } catch (e) {
        console.warn('runtime copy failed:', e.message);
      }
    }
  }

  // If transitioning from approved → denied/reopen, remove runtime file from repo
  if (prevStatus === 'approved' && body.action !== 'approve') {
    const runtimeDir = (config.sources || []).find(s => /in.?game|runtime/i.test(s.category || ''))?.dir
      || (config.sources || [])[0]?.dir;
    if (runtimeDir) {
      for (const ext of ['webp', 'png', 'gif', 'jpg']) {
        const path = `${runtimeDir}/${item.name}.${ext}`;
        try { await moveToTrash(token, config, branch, path, runtimeDir, `review ${body.action}`); } catch {}
      }
    }
  }
  json.updated = new Date().toISOString().slice(0, 10);

  await gh(token, paths.missingJsonPath, {
    method: 'PUT', github: config.github,
    body: {
      message: `missing: ${body.name} -> ${item.status}`,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha: miss.sha, branch,
    },
  });

  auditLog('review.action', { name: body.name, action: body.action, ip_hash });

  res.json({ ok: true, status: item.status });
});
