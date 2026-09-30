import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveRuntime } from '../src/runtime.ts';

test('runtime comes from the specified host and rejects absent, mismatched or unbuilt installations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'autocompose-runtime-'));
  try {
    const anchor = join(root, 'package.json');
    await writeFile(anchor, '{}');
    assert.throws(() => resolveRuntime(anchor), /未找到 DSH/);
    const runtime = join(root, 'node_modules', '@deepseek-ai', 'dsh');
    await mkdir(join(runtime, 'lib'), { recursive: true });
    const manifest = join(runtime, 'package.json');
    await writeFile(manifest, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.0', bin: { dsh: 'lib/bin.js' } }));
    assert.throws(() => resolveRuntime(anchor), /现有安装为 0.1.0/);
    await writeFile(manifest, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.0-rc.2', bin: { dsh: 'lib/bin.js' } }));
    assert.throws(() => resolveRuntime(anchor), /缺少编译后的 CLI/);
    const bin = join(runtime, 'lib', 'bin.js');
    await writeFile(bin, 'export {};');
    assert.deepEqual(resolveRuntime(anchor), { bin, manifest });
  } finally {
    assert(root.startsWith(join(tmpdir(), 'autocompose-runtime-')));
    await rm(root, { recursive: true, force: true });
  }
});
