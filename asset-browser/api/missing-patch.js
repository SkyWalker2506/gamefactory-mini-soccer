// POST /api/missing-patch { name, patch } — patch specific fields of a missing item
// Allowed fields: status, uploadedFile, denyReason
import { handler, validateName, validateFilename, requireFields } from './_handler.js';
import { auditLog } from './_audit.js';

const ALLOWED_STATUS = ['todo', 'in-progress', 'waiting-for-review', 'approved', 'denied', 'blocked'];
const PATCH_FIELDS = {
  status: v => typeof v === 'string' && ALLOWED_STATUS.includes(v),
  uploadedFile: v => v === null || validateFilename(v),
  denyReason: v => v === null || (typeof v === 'string' && v.length <= 500),
};

export default handler({ method: 'POST' }, async ({ res, token, config, branch, body, paths, gh, ip_hash }) => {
  const err = requireFields(body, ['name', 'patch']);
  if (err) return res.status(400).json({ error: err });
  if (!validateName(body.name)) return res.status(400).json({ error: 'invalid name' });
  if (typeof body.patch !== 'object' || Array.isArray(body.patch)) {
    return res.status(400).json({ error: 'patch must be object' });
  }

  const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
  const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
  const item = json.items.find(i => i.name === body.name);
  if (!item) return res.status(404).json({ error: 'item not found' });

  for (const k of Object.keys(body.patch)) {
    const validator = PATCH_FIELDS[k];
    if (!validator) continue;
    const v = body.patch[k];
    if (!validator(v)) return res.status(400).json({ error: `invalid value for ${k}` });
    if (v === null) delete item[k];
    else item[k] = v;
  }
  json.updated = new Date().toISOString().slice(0, 10);

  await gh(token, paths.missingJsonPath, {
    method: 'PUT', github: config.github,
    body: {
      message: `missing: patch ${body.name}`,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha: miss.sha, branch,
    },
  });

  auditLog('missing.patch', { name: body.name, ip_hash });

  res.json({ ok: true });
});
