// GET /api/trash — list trash files (public; metadata stripped)
// POST /api/trash { action: 'restore'|'purge', file } — restore to runtime or hard-delete (purge admin-only)
import { handler, validateFilename, isAdmin, requireFields } from './_handler.js';
import { auditLog } from './_audit.js';
import { sweepExpiredTrash } from './_trash-util.js';

export default async function (req, res) {
  // Multi-method endpoint: GET for list, POST for actions. Wrap manually.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET or POST' });
  }
  return handler({ method: req.method }, async ({ token, config, branch, body, paths, gh, ip_hash }) => {
    const retentionDays = parseInt(process.env.TRASH_RETENTION_DAYS || '30', 10);

    if (req.method === 'GET') {
      // Lazy sweep
      await sweepExpiredTrash({ token, config, branch, paths, maxAgeDays: retentionDays });

      let files = [];
      try {
        const list = await gh(token, paths.trashDir, { ref: branch, github: config.github });
        const now = Date.now();
        
        // We need meta for expires_in_days
        const allItems = Array.isArray(list) ? list : [];
        const metaFiles = allItems.filter(f => f.name.endsWith('.meta.json'));
        const fileItems = allItems.filter(f => !f.name.endsWith('.meta.json'));

        for (const f of fileItems) {
          const metaName = f.name.replace(/\.[^.]+$/, '') + '.meta.json';
          const mf = metaFiles.find(m => m.name === metaName);
          let expires_in_days = retentionDays;
          
          if (mf) {
            try {
              const mr = await gh(token, mf.path, { ref: branch, github: config.github });
              const meta = JSON.parse(Buffer.from(mr.content, 'base64').toString());
              if (meta.deletedAt) {
                const ageMs = now - new Date(meta.deletedAt).getTime();
                expires_in_days = Math.max(0, retentionDays - (ageMs / 86400000));
              }
            } catch {}
          }
          
          files.push({ name: f.name, size: f.size, sha: f.sha, expires_in_days });
        }
      } catch {}
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, files });
    }

    // POST
    const err = requireFields(body, ['action', 'file']);
    if (err) return res.status(400).json({ error: err });
    if (!['restore', 'purge'].includes(body.action)) {
      return res.status(400).json({ error: 'action must be restore|purge' });
    }
    if (!validateFilename(body.file)) return res.status(400).json({ error: 'invalid file' });
    if (body.action === 'purge' && !isAdmin(req)) {
      return res.status(403).json({ error: 'purge admin only' });
    }

    if (body.action === 'purge') {
      const path = `${paths.trashDir}/${body.file}`;
      const meta = await gh(token, path, { ref: branch, github: config.github });
      await gh(token, path, {
        method: 'DELETE', github: config.github,
        body: { message: `trash purge: ${body.file}`, sha: meta.sha, branch },
      });
      // Also purge meta sidecar if present.
      try {
        const metaSidecar = `${paths.trashDir}/${body.file.replace(/\.[^.]+$/, '')}.meta.json`;
        const ms = await gh(token, metaSidecar, { ref: branch, github: config.github });
        await gh(token, metaSidecar, {
          method: 'DELETE', github: config.github,
          body: { message: `trash meta purge`, sha: ms.sha, branch },
        });
      } catch {}
      return res.json({ ok: true });
    }

    // restore
    const metaPath = `${paths.trashDir}/${body.file.replace(/\.[^.]+$/, '')}.meta.json`;
    let originDir;
    try {
      const mr = await gh(token, metaPath, { ref: branch, github: config.github });
      const metaObj = JSON.parse(Buffer.from(mr.content, 'base64').toString());
      // Re-validate originDir against config.sources to prevent meta tampering attack.
      const candidate = metaObj.originDir;
      if (candidate && (config.sources || []).some(s => s.dir === candidate)) {
        originDir = candidate;
      }
    } catch {}
    if (!originDir) {
      // Fallback to first source dir (still safe — comes from our own config).
      originDir = (config.sources || [])[0]?.dir;
    }
    if (!originDir) return res.status(400).json({ error: 'origin unknown' });

    const trashPath = `${paths.trashDir}/${body.file}`;
    const trashMeta = await gh(token, trashPath, { ref: branch, github: config.github });
    let content = trashMeta.content;
    if (!content) {
      const blob = await fetch(
        `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/git/blobs/${trashMeta.sha}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
      ).then(r => r.json());
      content = blob.content;
    }

    const restorePath = `${originDir}/${body.file}`;
    let existingSha;
    try { existingSha = (await gh(token, restorePath, { ref: branch, github: config.github })).sha; } catch {}
    await gh(token, restorePath, {
      method: 'PUT', github: config.github,
      body: { message: `restore: ${body.file}`, content, branch, ...(existingSha ? { sha: existingSha } : {}) },
    });

    await gh(token, trashPath, {
      method: 'DELETE', github: config.github,
      body: { message: `trash remove after restore`, sha: trashMeta.sha, branch },
    });
    try {
      const m2 = await gh(token, metaPath, { ref: branch, github: config.github });
      await gh(token, metaPath, {
        method: 'DELETE', github: config.github,
        body: { message: `trash meta cleanup`, sha: m2.sha, branch },
      });
    } catch {}

    auditLog('trash.restore', { name: body.file, ip_hash });

    return res.json({ ok: true, restored: restorePath });
  })(req, res);
}
