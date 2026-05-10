// Shared helper: move a file from origin to trash/ (with meta)
import { gh } from './_config.js';
import { auditLog } from './_audit.js';
import { incr } from './_logger.js';

export async function sweepExpiredTrash({ token, config, branch, paths, maxAgeDays = 30, dryRun = false }) {
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  let purged = 0;
  let remaining = 0;

  try {
    const list = await gh(token, paths.trashDir, { ref: branch, github: config.github });
    const metaFiles = (Array.isArray(list) ? list : []).filter(f => f.name.endsWith('.meta.json'));
    
    for (const mf of metaFiles) {
      try {
        const metaRes = await gh(token, mf.path, { ref: branch, github: config.github });
        const meta = JSON.parse(Buffer.from(metaRes.content, 'base64').toString());
        
        if (!meta.deletedAt) {
          remaining++;
          continue;
        }

        const ageMs = now - new Date(meta.deletedAt).getTime();
        if (ageMs > maxAgeMs) {
          if (!dryRun) {
            const fileName = mf.name.replace('.meta.json', '');
            // Try to find the actual file. We don't know the extension easily from mf.name if it had multiple dots, 
            // but meta.originPath should have it.
            const actualFileName = meta.originPath.split('/').pop();
            const actualFilePath = `${paths.trashDir}/${actualFileName}`;
            
            // Delete actual file
            try {
              const af = await gh(token, actualFilePath, { ref: branch, github: config.github });
              await gh(token, actualFilePath, {
                method: 'DELETE', github: config.github,
                body: { message: `trash auto-purge: ${actualFileName}`, sha: af.sha, branch }
              });
            } catch (e) {
              // Maybe already deleted or name mismatch
            }

            // Delete meta file
            await gh(token, mf.path, {
              method: 'DELETE', github: config.github,
              body: { message: `trash auto-purge meta: ${mf.name}`, sha: metaRes.sha, branch }
            });

            incr('trash_purged');
            auditLog('trash.purge', { name: actualFileName, age_days: Math.floor(ageMs / 86400000) });
          }
          purged++;
        } else {
          remaining++;
        }
      } catch (e) {
        remaining++;
      }
    }
  } catch (e) {
    // maybe trashDir doesn't exist yet
  }

  return { purged, remaining, dryRun, maxAgeDays };
}

export async function moveToTrash(token, config, branch, originPath, originDir, reason = '') {
  const uploadPrefix = config.uploadPath || 'asset-browser/data/uploads';
  const trashDir = `${uploadPrefix.split('/').slice(0, -1).join('/')}/trash`;
  const filename = originPath.split('/').pop();

  let meta;
  try { meta = await gh(token, originPath, { ref: branch, github: config.github }); } catch { return false; }

  // fetch content (handle large files via blobs API)
  let content = meta.content;
  if (!content) {
    const blob = await fetch(`https://api.github.com/repos/${config.github.owner}/${config.github.repo}/git/blobs/${meta.sha}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    }).then(r => r.json());
    content = blob.content;
  }

  // PUT to trash/
  const trashPath = `${trashDir}/${filename}`;
  let tSha;
  try { tSha = (await gh(token, trashPath, { ref: branch, github: config.github })).sha; } catch {}
  await gh(token, trashPath, {
    method: 'PUT', github: config.github,
    body: { message: `trash: ${filename}${reason ? ' ('+reason+')' : ''}`, content, branch, ...(tSha ? { sha: tSha } : {}) },
  });

  // PUT meta (origin info for restore)
  const metaPath = `${trashDir}/${filename.replace(/\.[^.]+$/, '')}.meta.json`;
  const metaContent = Buffer.from(JSON.stringify({
    originPath, originDir, reason, deletedAt: new Date().toISOString(),
  }, null, 2)).toString('base64');
  let mSha;
  try { mSha = (await gh(token, metaPath, { ref: branch, github: config.github })).sha; } catch {}
  await gh(token, metaPath, {
    method: 'PUT', github: config.github,
    body: { message: `trash meta: ${filename}`, content: metaContent, branch, ...(mSha ? { sha: mSha } : {}) },
  });

  // DELETE from origin
  await gh(token, originPath, {
    method: 'DELETE', github: config.github,
    body: { message: `delete (moved to trash): ${filename}`, sha: meta.sha, branch },
  });

  return true;
}
