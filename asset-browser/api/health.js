import fs from 'node:fs/promises';
import path from 'node:path';
import { handler, isAdmin } from './_handler.js';
import { _bucketCount, isKvDetected, POLICIES } from './_ratelimit.js';

export default handler({ method: 'GET', requireToken: false, skipRateLimit: false, rateLimitName: 'health' }, async ({ req, res, config, paths }) => {
  const uptime_ms = Math.round(process.uptime() * 1000);
  const node_version = process.version;
  const commit_sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || 'unknown').substring(0, 7);
  const build_time = process.env.VERCEL_BUILD_COMPLETED_AT || process.env.BUILD_TIME || new Date().toISOString();

  let assetsTotal = 0;
  let missingCount = 0;

  try {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
    const manifestData = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestData);
    assetsTotal = typeof manifest.count === 'number' ? manifest.count : (Array.isArray(manifest.items) ? manifest.items.length : 0);
  } catch {
    // Fallback to 0 if manifest not found
  }

  try {
    const missingData = await fs.readFile(path.resolve(process.cwd(), paths.missingJsonPath), 'utf8');
    const missing = JSON.parse(missingData);
    missingCount = Array.isArray(missing.items) ? missing.items.length : 0;
  } catch {
    // Fallback to 0 if missing.json not found
  }

  const status = missingCount > 0 ? 'degraded' : 'ok';

  const response = {
    status,
    uptime_ms,
    node_version,
    commit_sha,
    build_time,
    rate_limiter: {
      bucket_count: _bucketCount(),
      kv_detected: isKvDetected(),
      in_memory_store_size: _bucketCount()
    },
    assets: {
      total: assetsTotal,
      missing_count: missingCount
    }
  };

  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('detail') === '1' && isAdmin(req)) {
    response.details = {
      env_keys: Object.keys(process.env),
      policies: POLICIES,
      memory_usage: process.memoryUsage()
    };
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(response);
});
