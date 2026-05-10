import fs from 'node:fs';
import path from 'node:path';
import { handler, isAdmin } from './_handler.js';
import { incr, log } from './_logger.js';

export default handler({ method: 'POST', skipRateLimit: true }, async ({ req, res, config, paths, body }) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (body.version !== 1 || !Array.isArray(body.missing)) {
    return res.status(400).json({ error: 'invalid backup format' });
  }

  const url = new URL(req.url, 'http://x');
  const confirm = url.searchParams.get('confirm') === '1';

  let currentMissing = [];
  try {
    const data = fs.readFileSync(path.resolve(process.cwd(), paths.missingJsonPath), 'utf8');
    currentMissing = JSON.parse(data).items || [];
  } catch (e) {
    // ignore
  }

  const currentNames = new Set(currentMissing.map(i => i.name));
  const newNames = new Set(body.missing.map(i => i.name));

  const missing_to_add = body.missing.filter(i => !currentNames.has(i.name)).length;
  const missing_to_remove = currentMissing.filter(i => !newNames.has(i.name)).length;
  const changes = missing_to_add + missing_to_remove;

  if (!confirm) {
    log('info', 'restore.applied', { dry_run: true, changes });
    return res.json({
      would_apply: {
        missing_to_add,
        missing_to_remove,
        total_missing: body.missing.length
      }
    });
  }

  const fullPath = path.resolve(process.cwd(), paths.missingJsonPath);
  const tempPath = `${fullPath}.tmp`;
  try {
    const content = JSON.stringify({
      updated: new Date().toISOString().slice(0, 10),
      items: body.missing
    }, null, 2);
    
    fs.writeFileSync(tempPath, content, 'utf8');
    const fd = fs.openSync(tempPath, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tempPath, fullPath);
  } catch (e) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (err) {}
    }
    throw e;
  }

  incr('restore_total');
  log('info', 'restore.applied', { dry_run: false, changes });

  res.json({ ok: true, applied: { missing_to_add, missing_to_remove } });
});
