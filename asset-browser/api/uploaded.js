// GET /api/uploaded?file=xxx.png — proxy uploaded file from GitHub
import { handler, validateFilename } from './_handler.js';

const MIME = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

export default handler({ method: 'GET' }, async ({ req, res, token, config, branch, paths, gh }) => {
  const file = req.query?.file || (() => {
    try { return new URL(req.url, 'http://x').searchParams.get('file') || ''; } catch { return ''; }
  })();
  if (!validateFilename(file)) return res.status(400).json({ error: 'invalid file' });

  try {
    const meta = await gh(token, `${paths.uploadPrefix}/${file}`, { ref: branch, github: config.github });
    let buf;
    if (meta.content) {
      buf = Buffer.from(meta.content, 'base64');
    } else {
      const blobUrl = `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/git/blobs/${meta.sha}`;
      const br = await fetch(blobUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!br.ok) throw new Error(`GitHub blob ${br.status}`);
      const bj = await br.json();
      buf = Buffer.from(bj.content, 'base64');
    }
    const ext = (file.split('.').pop() || '').toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    if (meta.sha) res.setHeader('ETag', `"${meta.sha}"`);
    res.status(200).send(buf);
  } catch (e) {
    res.status(404).json({ error: 'not found' });
  }
});
