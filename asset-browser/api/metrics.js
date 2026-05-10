// api/metrics.js: Metrics endpoint.
import { metrics } from './_logger.js';

export default (req, res) => {
  const m = metrics();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const detail = url.searchParams.get('detail') === '1';
  const adminToken = req.headers['x-admin-token'] || url.searchParams.get('admin');
  const envToken = process.env.ADMIN_TOKEN || 'dev-token';

  const response = {
    counters: {
      requests_total: m.counters.requests_total || 0,
      errors_total: m.counters.errors_total || 0,
      ratelimited_total: m.counters.ratelimited_total || 0
    },
    uptime_ms: m.uptime_ms,
    since: m.since
  };

  if (detail && adminToken === envToken) {
    response.counters = m.counters;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(response));
};
