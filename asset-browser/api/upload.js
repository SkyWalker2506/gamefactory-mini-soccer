import { handler, validateName, validateFilename, base64ByteLength, requireFields } from './_handler.js';
import { auditLog } from './_audit.js';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB binary, aligned with client-side check

export default handler({ method: 'POST' }, async ({ res, token, config, branch, body, paths, gh, ip_hash }) => {
  const err = requireFields(body, ['name', 'filename', 'dataBase64']);
  if (err) return res.status(400).json({ error: err });
  if (!validateName(body.name)) return res.status(400).json({ error: 'invalid name' });
  if (!validateFilename(body.filename)) return res.status(400).json({ error: 'invalid filename' });

  const size = base64ByteLength(body.dataBase64);
  if (size === 0) return res.status(400).json({ error: 'empty payload' });
  if (size > MAX_BYTES) return res.status(413).json({ error: `payload too large (${size} > ${MAX_BYTES})` });

  // 1. Upload file to uploadPath
  const filePath = `${paths.uploadPrefix}/${body.filename}`;
  let existingSha;
  try { existingSha = (await gh(token, filePath, { ref: branch, github: config.github })).sha; } catch {}
  await gh(token, filePath, {
    method: 'PUT', github: config.github,
    body: { message: `asset upload: ${body.name}`, content: body.dataBase64, branch, ...(existingSha ? { sha: existingSha } : {}) },
  });

  // 2. Update missing.json
  const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
  const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
  const item = json.items.find(i => i.name === body.name);
  if (!item) return res.status(404).json({ error: 'missing item not found' });
  item.status = 'waiting-for-review';
  item.uploadedFile = body.filename;
  json.updated = new Date().toISOString().slice(0, 10);
  await gh(token, paths.missingJsonPath, {
    method: 'PUT', github: config.github,
    body: {
      message: `missing: ${body.name} -> waiting-for-review`,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
      sha: miss.sha, branch,
    },
  });

  auditLog('asset.upload', { name: body.name, size, ip_hash });

  res.json({ ok: true, name: body.name, filename: body.filename, size });
});

export const config = { api: { bodyParser: { sizeLimit: '30mb' } } };
