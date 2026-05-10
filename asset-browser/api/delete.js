import { handler, validateName, requireFields } from './_handler.js';
import { moveToTrash } from './_trash-util.js';
import { auditLog } from './_audit.js';

export default handler({ method: 'POST' }, async ({ res, token, config, branch, body, paths, gh, ip_hash }) => {
  const err = requireFields(body, ['name']);
  if (err) return res.status(400).json({ error: err });
  if (!validateName(body.name)) return res.status(400).json({ error: 'invalid name' });

  const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
  const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
  const item = json.items.find(i => i.name === body.name);
  if (!item) return res.status(404).json({ error: 'item not found' });
  if (!['waiting-for-review', 'denied', 'approved'].includes(item.status)) {
    return res.status(400).json({ error: 'nothing to delete' });
  }

  // Move upload file to trash
  if (item.uploadedFile) {
    const filePath = `${paths.uploadPrefix}/${item.uploadedFile}`;
    try { await moveToTrash(token, config, branch, filePath, paths.uploadPrefix, `delete ${item.status}`); } catch {}
  }

  // Move runtime asset to trash too
  const runtimeDir = (config.sources || []).find(s => /in.?game|runtime/i.test(s.category || ''))?.dir
    || (config.sources || [])[0]?.dir;
  if (runtimeDir) {
    for (const ext of ['webp', 'png', 'gif', 'jpg']) {
      const rp = `${runtimeDir}/${item.name}.${ext}`;
      try { await moveToTrash(token, config, branch, rp, runtimeDir, `delete ${item.status}`); } catch {}
    }
  }

  item.status = 'todo';
  delete item.uploadedFile;
  json.updated = new Date().toISOString().slice(0, 10);
  await gh(token, paths.missingJsonPath, {
    method: 'PUT', github: config.github,
    body: {
      message: `missing: ${body.name} -> todo`,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha: miss.sha, branch,
    },
  });

  const runtimeDir = (config.sources || []).find(s => /in.?game|runtime/i.test(s.category || ''))?.dir
    || (config.sources || [])[0]?.dir;

  auditLog('asset.delete', { name: body.name, originDir: runtimeDir, ip_hash });

  res.json({ ok: true });
});
