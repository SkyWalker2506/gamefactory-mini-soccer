import test from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../scripts/perf-budget.mjs');

test('Performance Budget Script', async (t) => {
  await t.test('should exit with code 0 and return valid JSON with --json flag', () => {
    const result = spawnSync('node', [SCRIPT_PATH, '--json'], { encoding: 'utf8' });
    
    assert.strictEqual(result.status, 0, `Script failed with exit code ${result.status}: ${result.stderr}`);
    
    let data;
    try {
      data = JSON.parse(result.stdout);
    } catch (e) {
      assert.fail(`Failed to parse JSON output: ${e.message}\nOutput: ${result.stdout}`);
    }
    
    assert(Array.isArray(data), 'Output should be an array');
    assert(data.length > 0, 'Output array should not be empty');
  });

  await t.test('all hard budgets should be present in the report', () => {
    const result = spawnSync('node', [SCRIPT_PATH, '--json'], { encoding: 'utf8' });
    const data = JSON.parse(result.stdout);
    
    const hardBudgetNames = [
      'Single JS file',
      'Total public/js/*.js',
      'public/index.html',
      'Single locale JSON',
      'public/sw.js'
    ];
    
    for (const name of hardBudgetNames) {
      const found = data.some(r => r.name.startsWith(name) && r.isHard);
      assert(found, `Hard budget "${name}" missing from report`);
    }
  });

  await t.test('all hard budgets should pass (current state)', () => {
    const result = spawnSync('node', [SCRIPT_PATH, '--json'], { encoding: 'utf8' });
    const data = JSON.parse(result.stdout);
    
    const failedHard = data.filter(r => r.isHard && !r.pass);
    if (failedHard.length > 0) {
      const details = failedHard.map(f => `${f.name}: ${f.actual} > ${f.limit}`).join('\n');
      assert.fail(`Hard budgets failed:\n${details}`);
    }
  });
});
