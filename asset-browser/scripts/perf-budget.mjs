import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');

const HARD_BUDGETS = [
  { name: 'Single JS file', pattern: /^public\/js\/.*\.js$/, limit: 25 * 1024 },
  { name: 'Total public/js/*.js', pattern: /^public\/js\/.*\.js$/, total: true, limit: 80 * 1024 },
  { name: 'public/index.html', pattern: /^public\/index\.html$/, limit: 35 * 1024 },
  { name: 'Single locale JSON', pattern: /^public\/locales\/.*\.json$/, limit: 8 * 1024 },
  { name: 'public/sw.js', pattern: /^public\/sw\.js$/, limit: 8 * 1024 }
];

const SOFT_WARNINGS = [
  { name: 'Single asset > 50KB', pattern: /^public\/.*\.(svg|png|jpg|jpeg|webp|avif)$/, limit: 50 * 1024 },
  { name: 'Total public/ > 1MB', pattern: /^public\/.*$/, total: true, limit: 1024 * 1024 }
];

async function walk(dir) {
  let files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await walk(res));
    } else {
      files.push(res);
    }
  }
  return files;
}

async function run() {
  const allFiles = await walk(PUBLIC_DIR);
  const results = [];
  const fileData = [];

  for (const file of allFiles) {
    const stats = await fs.stat(file);
    const relPath = path.relative(ROOT_DIR, file);
    fileData.push({ path: relPath, size: stats.size });
  }

  const checkBudgets = (budgets, isHard) => {
    for (const budget of budgets) {
      const matches = fileData.filter(f => budget.pattern.test(f.path));
      if (budget.total) {
        const totalSize = matches.reduce((acc, f) => acc + f.size, 0);
        results.push({
          name: budget.name,
          limit: budget.limit,
          actual: totalSize,
          pass: totalSize <= budget.limit,
          isHard
        });
      } else {
        for (const match of matches) {
          results.push({
            name: `${budget.name} (${match.path})`,
            limit: budget.limit,
            actual: match.size,
            pass: match.size <= budget.limit,
            isHard
          });
        }
      }
    }
  };

  checkBudgets(HARD_BUDGETS, true);
  checkBudgets(SOFT_WARNINGS, false);

  const isJson = process.argv.includes('--json');

  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('Performance Budget Report');
    console.log('=========================');
    
    const printTable = (items) => {
      console.log(`${'Result'.padEnd(8)} | ${'Name'.padEnd(50)} | ${'Actual'.padStart(10)} | ${'Limit'.padStart(10)}`);
      console.log('-'.repeat(85));
      for (const item of items) {
        const status = item.pass ? 'PASS' : (item.isHard ? 'FAIL' : 'WARN');
        console.log(`${status.padEnd(8)} | ${item.name.padEnd(50)} | ${(item.actual / 1024).toFixed(2).padStart(7)} KB | ${(item.limit / 1024).toFixed(2).padStart(7)} KB`);
      }
      console.log('');
    };

    console.log('Hard Budgets:');
    printTable(results.filter(r => r.isHard));
    
    console.log('Soft Warnings:');
    printTable(results.filter(r => !r.isHard));

    const failedHard = results.filter(r => r.isHard && !r.pass);
    if (failedHard.length > 0) {
      console.error(`FAILED: ${failedHard.length} hard budget(s) exceeded.`);
      process.exit(1);
    }
    console.log('All hard budgets passed.');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
