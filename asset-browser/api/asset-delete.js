// POST /api/asset-delete { file, dir } — move runtime asset file to trash
import { handler, validateFilename, safePathSegment, requireFields } from './_handler.js';
import { moveToTrash } from './_trash-util.js';
import { auditLog } from './_audit.js';

export default handler({ method: 'POST' }, async ({ res, token, config, branch, body, ip_hash }) => {
  const err = requireFields(body, ['file', 'dir']);
  if (err) return res.status(400).json({ error: err });

  const safeDir = safePathSegment(body.dir);
  if (!safeDir) return res.status(400).json({ error: 'invalid dir' });
  if (!(config.sources || []).some(s => s.dir === safeDir)) {
    return res.status(400).json({ error: 'dir not in config.sources' });
  }
  if (!validateFilename(body.file)) {
    return res.status(400).json({ error: 'invalid file (alphanum, ., _, - only; no slashes)' });
  }

  const path = `${safeDir}/${body.file}`;
  const ok = await moveToTrash(token, config, branch, path, safeDir, 'user delete from assets');
  if (!ok) return res.status(404).json({ error: 'file not found' });

  auditLog('asset_delete.permanent', { name: body.file, ip_hash });

  res.json({ ok: true });
});
