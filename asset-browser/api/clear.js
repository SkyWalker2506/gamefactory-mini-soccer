// POST /api/clear { name } — remove an entry from missing.json (asset stays in runtime)
import { handler, validateName, requireFields } from './_handler.js';
import { auditLog } from './_audit.js';

export default handler({ method: 'POST' }, async ({ res, token, config, branch, body, paths, gh, ip_hash }) => {
  const err = requireFields(body, ['name']);
  if (err) return res.status(400).json({ error: err });
  if (!validateName(body.name)) return res.status(400).json({ error: 'invalid name' });

  const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
  const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
  const before = json.items.length;
  json.items = json.items.filter(i => i.name !== body.name);
  if (json.items.length === before) return res.status(404).json({ error: 'item not found' });
  json.updated = new Date().toISOString().slice(0, 10);

  await gh(token, paths.missingJsonPath, {
    method: 'PUT', github: config.github,
    body: {
      message: `missing: clear ${body.name}`,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha: miss.sha, branch,
    },
  });

  auditLog('trash.clear', { count: 1, ip_hash });

  res.json({ ok: true });
});
