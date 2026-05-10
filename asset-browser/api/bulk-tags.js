// POST /api/bulk-tags { names: [], addTags: [], removeTags: [] }
import { handler, validateName, requireFields } from './_handler.js';
import { auditLog } from './_audit.js';

export default handler({ method: 'POST' }, async ({ res, token, config, branch, body, paths, gh, ip_hash }) => {
  const err = requireFields(body, ['names', 'addTags', 'removeTags']);
  if (err) return res.status(400).json({ error: err });
  if (!Array.isArray(body.names) || !Array.isArray(body.addTags) || !Array.isArray(body.removeTags)) {
    return res.status(400).json({ error: 'names, addTags, removeTags must be arrays' });
  }

  const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
  const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
  
  let changed = 0;
  for (const name of body.names) {
    const item = json.items.find(i => i.name === name);
    if (!item) continue;
    
    const tags = new Set(item.tags || []);
    let itemChanged = false;
    
    for (const t of body.addTags) {
      if (!tags.has(t)) {
        tags.add(t);
        itemChanged = true;
      }
    }
    for (const t of body.removeTags) {
      if (tags.has(t)) {
        tags.delete(t);
        itemChanged = true;
      }
    }
    
    if (itemChanged) {
      item.tags = [...tags];
      changed++;
    }
  }

  if (changed > 0) {
    json.updated = new Date().toISOString().slice(0, 10);
    await gh(token, paths.missingJsonPath, {
      method: 'PUT', github: config.github,
      body: {
        message: `missing: bulk tags for ${changed} items`,
        content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
        sha: miss.sha, branch,
      },
    });
  }

  auditLog('bulk_tags.apply', { count: body.names.length, addTags: body.addTags, removeTags: body.removeTags, ip_hash });

  res.json({ ok: true, changed });
});
