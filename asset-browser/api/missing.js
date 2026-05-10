// GET /api/missing — serve missing.json live from GitHub (bypasses Vercel build cache)
import { handler } from './_handler.js';

export default handler({ method: 'GET' }, async ({ res, token, config, branch, paths, gh }) => {
  const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
  const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
  res.setHeader('Cache-Control', 'no-store');
  // ETag based on the missing.json sha — clients can use If-None-Match for free 304s.
  if (miss.sha) res.setHeader('ETag', `"${miss.sha}"`);
  res.json(json);
});
