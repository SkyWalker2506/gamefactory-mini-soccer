import fs from 'node:fs';
import path from 'node:path';
import { handler, isAdmin } from './_handler.js';
import { incr, log } from './_logger.js';

export default handler({ method: 'GET', skipRateLimit: true }, async ({ req, res, token, config, branch, paths, gh }) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const now = new Date().toISOString();
  const timestamp = now.replace(/[:.]/g, '-');
  
  const backup = {
    version: 1,
    generated_at: now,
    sources: config.sources || [],
    missing: [],
    assets: []
  };

  // 1. Read missing.json (GitHub priority, fallback local)
  try {
    const miss = await gh(token, paths.missingJsonPath, { ref: branch, github: config.github });
    const json = JSON.parse(Buffer.from(miss.content, 'base64').toString());
    backup.missing = json.items || [];
  } catch (e) {
    try {
      const data = fs.readFileSync(path.resolve(process.cwd(), paths.missingJsonPath), 'utf8');
      backup.missing = JSON.parse(data).items || [];
    } catch (err) {
      // ignore
    }
  }

  // 2. Read public/manifest.json (local)
  try {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const data = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(data);
      backup.manifest_count = manifest.count;
      backup.manifest_updated = manifest.updated;
    }
  } catch (e) {
    // ignore
  }

  // 3. Read asset directories
  const projectRoot = path.resolve(process.cwd(), config.projectRoot || '.');
  for (const source of (config.sources || [])) {
    try {
      const dirPath = path.resolve(projectRoot, source.dir);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.startsWith('.')) continue;
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            backup.assets.push({
              name: file,
              dir: source.dir,
              size: stat.size,
              ext: path.extname(file).slice(1)
            });
          }
        }
      }
    } catch (e) {
      // ignore individual dir errors
    }
  }

  incr('backup_total');
  log('info', 'backup.created', { assets_count: backup.assets.length, missing_count: backup.missing.length });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="asset-browser-backup-${timestamp}.json"`);
  res.status(200).json(backup);
});
