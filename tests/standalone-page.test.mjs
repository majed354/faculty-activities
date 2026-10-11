import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { standalonePage, safeJson, readDeploySnapshot } from '../scripts/standalone-page.mjs';

test('the deployed entry contains its styles, runtime and roster with safe inline script boundaries', async () => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const page = await standalonePage({ source, bootstrap: { members: [{ id: '1', name: '</script><script>alert(1)</script>' }] }, readAsset: async path => {
    if (path.endsWith('.css')) return '.modal { display:none }';
    if (['app.js', 'teaching.js'].includes(path)) return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    return 'window.runtimeTest = "$&";';
  } });
  assert.doesNotMatch(page, /<script[^>]+src=/);
  assert.doesNotMatch(page, /<link rel="stylesheet" href="(?:style|teaching|cv)/);
  assert.ok(page.indexOf('id="siteBootstrap"') < page.indexOf('data-site-asset="assets/site-runtime.js"'));
  for (const match of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) assert.doesNotThrow(() => new vm.Script(match[1]));
  assert.equal(JSON.parse(safeJson({ value: '</script>' })).value, '</script>');
  assert.ok(page.includes('runtimeTest="$&"'));
});

test('a build never embeds an unverified or expired activity response', async () => {
  const now = Date.now();
  const data = { publications: [{ id: '1' }], theses: [], participations: [], sync: { sourceId: 'source', syncedAt: new Date(now).toISOString() } };
  const read = payload => readDeploySnapshot({ origin: 'https://faculty.test', sourceId: 'source', now, fetchImpl: async () => Response.json(payload) });
  assert.equal((await read(data)).publications.length, 1);
  assert.equal(await read({ ...data, sync: { ...data.sync, sourceId: 'wrong' } }), null);
  assert.equal(await read({ ...data, sync: { ...data.sync, syncedAt: '2020-01-01' } }), null);
  assert.equal(await read({ publications: [], theses: [], participations: [] }), null);
});
