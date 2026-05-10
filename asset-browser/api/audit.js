import { handler, isAdmin } from './_handler.js';
import { readAuditLog } from './_audit.js';

export default handler({ method: 'GET', skipRateLimit: true }, async ({ req, res }) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const url = new URL(req.url, 'http://x');
  const limitStr = url.searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 100;
  const since = url.searchParams.get('since');

  const logs = readAuditLog({ limit, since });
  
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(logs);
});
