import test from 'node:test';

import assert from 'node:assert/strict';

import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { tmpdir } from 'node:os';

import { scanProfile } from '../shared/profile.ts';

import { checkCompatibility } from '../shared/compatibility.ts';

import { writeJson, withLock } from '../shared/files.ts';

import { inspectCandidate, discover, RUNTIME_VERSION } from '../src/catalog.ts';

import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader';

import { TYPERT } from '../src/typert.ts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-resilience-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJson(join(root, 'package.json'), { dependencies: { 'fixture-addon': '1.0.0' }, dsh: { profile: { bundles: ['fixture-addon'] } } });
  const directory = join(root, 'node_modules', 'fixture-addon'); await mkdir(directory, { recursive: true });
  const manifest = { name: 'fixture-addon', version: '1.0.0', main: 'index.js', dsh: { bundle: { patch: './cordis.patch.yml' } }, dshCompat: { dsh: '>=0.2.0-rc.2 <0.3.0-0' } };
  await writeJson(join(directory, 'package.json'), manifest);
  await writeFile(join(directory, 'cordis.patch.yml'), '- insert:\n  - id: addon\n    name: fixture-addon\n');
  await writeFile(join(directory, 'index.js'), 'throw new Error("scanner executed code")');
  return { root, directory, manifest };
}

test('合法的 ID 定向覆盖和完整前端产物不被误判为重复注册', async t => {
  const { root, directory, manifest } = await fixture(t);
  await writeFile(join(directory, 'cordis.patch.yml'), '- insert:\n  - id: addon\n    name: fixture-addon\n- id: addon\n  config:\n    enabled: true\n');
  await writeFile(join(directory, 'client.js'), 'throw new Error("must never be executed by scanner")');
  await writeJson(join(directory, 'package.json'), { ...manifest, dsh: { ...manifest.dsh, client: { platform: 'web' } }, exports: { './client': { default: './client.js' } } });
  const rows = await scanProfile(root);
  assert.equal(rows[0].loadError, undefined); assert.deepEqual(checkCompatibility(rows, RUNTIME_VERSION).findings, []);
});

test('RPC 旧编解码声明缺少 create 时被真实 DSH 验证器拒绝', () => {
  const bad = { ...TYPERT, invocations: TYPERT.invocations.map(x => ({ ...x, result: { ...x.result, create: undefined } })) };
  assert.throws(() => validateTypertManifest('dsh-autocompose', bad), /create/);
});

const packageData = () => ({ name: 'fixture-addon', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  dist: { integrity: 'sha512-fixture' }, dshCompat: { capabilities: ['pdf'] } });

for (const scenario of ['404', 'network', 'invalid-json', 'identity-changed', 'no-bundle', 'missing-integrity', 'changed-artifact'] as const) {
  test(`npm 元数据异常不进入可执行组合：${scenario}`, async t => {
    const data = packageData();
    t.mock.method(globalThis, 'fetch', async () => {
      if (scenario === 'network') throw new Error('ECONNRESET fixture');
      if (scenario === '404') return new Response('not found', { status: 404 });
      if (scenario === 'invalid-json') return new Response('{bad');
      if (scenario === 'identity-changed') data.name = 'different-package';
      if (scenario === 'no-bundle') (data as Record<string, unknown>).dsh = {};
      if (scenario === 'missing-integrity') (data as Record<string, unknown>).dist = {};
      return new Response(JSON.stringify(data));
    });
    if (scenario === 'changed-artifact') {
      const first = await inspectCandidate('fixture-addon', '1.0.0');
      data.dist.integrity = 'sha512-changed';
      const second = await inspectCandidate('fixture-addon', '1.0.0');
      assert.notEqual(first.integrity, second.integrity);
    } else await assert.rejects(inspectCandidate('fixture-addon', '1.0.0'));
  });
}

test('不接受安装指令、非精确版本和任意搜索文本作为包参数', async () => {
  await assert.rejects(inspectCandidate('--ignore-scripts', '1.0.0'));
  await assert.rejects(inspectCandidate('fixture-addon', 'latest'));
  await assert.rejects(discover('pdf; run-command'));
});
