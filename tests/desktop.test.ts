import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { desktopLaunch, windowMode } from '../src/desktop.ts';
import { WebEnvironments } from '../src/environments.ts';
import { createPlan } from '../src/planner.ts';
import { builtins, RUNTIME_VERSION } from '../src/catalog.ts';

test('desktop selection respects explicit mode and fails before installation when the client is unavailable', async () => {
  assert.equal(windowMode({ windowMode: 'web', desktopExecutable: '/client' }), 'web');
  assert.equal(windowMode({ desktopExecutable: '/client' }), 'desktop');
  const root = await mkdtemp(join(tmpdir(), 'autocompose-desktop-'));
  try {
    const envs = new WebEnvironments({ root, windowMode: 'desktop', desktopExecutable: join(root, 'absent.exe') });
    const plan = createPlan({ task: '检查代码', cwd: root, catalog: builtins, runtimeVersion: RUNTIME_VERSION });
    await assert.rejects(envs.open(plan, { mode: 'read-only', keep: true, signal: new AbortController().signal }), /未找到 DSH 桌面客户端/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native launch isolates Electron data and DSH_HOME, and strips Node mode without shell quoting paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'autocompose-native-'));
  const previous = process.env.ELECTRON_RUN_AS_NODE;
  try {
    const base = process.platform === 'darwin' ? join(root, 'DSH.app', 'Contents') : root;
    const executable = process.platform === 'darwin' ? join(base, 'MacOS', 'DeepSeek Harness') : join(base, 'DeepSeek Harness.exe');
    await mkdir(process.platform === 'darwin' ? join(base, 'MacOS') : base, { recursive: true });
    const resources = join(base, process.platform === 'darwin' ? 'Resources' : 'resources');
    await mkdir(resources, { recursive: true });
    await writeFile(executable, 'fixture'); await writeFile(join(resources, 'app.asar'), 'fixture');
    process.env.ELECTRON_RUN_AS_NODE = '1';
    const home = join(root, '独立 环境', 'home'), directory = join(root, '独立 环境');
    const spec = desktopLaunch({ desktopExecutable: executable }, home, directory, ['ELECTRON_RUN_AS_NODE']);
    assert.equal(spec.env.ELECTRON_RUN_AS_NODE, undefined);
    assert.equal(spec.env.DSH_HOME, home);
    assert.deepEqual(spec.args, [`--user-data-dir=${join(directory, 'desktop-data')}`]);
    assert.equal(spec.executable, executable);
    assert.match(spec.cli, /dsh-desktop-host/);
  } finally {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE; else process.env.ELECTRON_RUN_AS_NODE = previous;
    await rm(root, { recursive: true, force: true });
  }
});
