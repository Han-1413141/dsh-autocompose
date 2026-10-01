/** Opt-in installed Desktop integration: local model, isolated profile, native application. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPlan, builtins, RUNTIME_VERSION, WebEnvironments } from '../lib/core.js';
if (!process.env.AUTOCOMPOSE_DESKTOP_EXE) throw new Error('Set AUTOCOMPOSE_DESKTOP_EXE to the installed official DSH executable.');
const root = await mkdtemp(join(tmpdir(), 'dsh-compose-window-'));
let calls = 0;
const model = createServer((req, res) => {
  req.resume(); req.on('end', () => {
    calls++;
    const events = [
      { type: 'message_start', message: { id: 'window-fixture', model: 'deepseek-v4-flash', usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Window fixture response.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } }, { type: 'message_stop' },
    ];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
  });
});
await new Promise(done => model.listen(0, '127.0.0.1', done));
process.env.DEEPSEEK_API_KEY = 'local-window-fixture';
process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${model.address().port}`;
const windows = new WebEnvironments({ root, windowMode: 'desktop', desktopExecutable: process.env.AUTOCOMPOSE_DESKTOP_EXE, envKeys: ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'] });
try {
  const plan = createPlan({ task: '检查代码', cwd: root, owner: 'window-smoke', runtimeVersion: RUNTIME_VERSION, catalog: builtins });
  const opened = await windows.open(plan, { mode: 'read-only', keep: false, signal: AbortSignal.timeout(120000) });
  assert.equal(opened.status, 'ready'); assert(opened.sessionId, JSON.stringify(opened));
  assert.equal(opened.windowMode, 'desktop');
  assert(opened.processId);
  process.kill(opened.processId, 0);
  const profile = JSON.parse(await readFile(join(opened.directory, 'home/profiles/desktop/package.json'), 'utf8'));
  assert(profile.dsh.profile.bundles.includes('@deepseek-ai/dsh-web-app'));
  await assert.rejects(windows.reveal(opened.id, 'another-session'), /关闭/);
  const revealed = await windows.reveal(opened.id, 'window-smoke');
  assert.deepEqual(revealed, { windowMode: 'desktop' });
  process.kill(opened.processId, 0);
  // Verify the bundled CLI's reserved desktop profile handling using a local no-op plugin.
  const fixture = join(root, 'fixture'), marker = join(root, 'fixture-loaded.txt');
  await mkdir(fixture);
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'dsh-autocompose-desktop-fixture', version: '1.0.0', type: 'module',
    main: 'index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
  await writeFile(join(fixture, 'index.js'), `import {writeFileSync} from 'node:fs'; export function apply() { writeFileSync(${JSON.stringify(marker)}, 'loaded'); }`);
  await writeFile(join(fixture, 'cordis.patch.yml'), '- insert:\n  - id: desktop-fixture\n    name: dsh-autocompose-desktop-fixture\n');
  const executable = process.env.AUTOCOMPOSE_DESKTOP_EXE;
  const resources = process.platform === 'darwin' ? resolve(dirname(executable), '../Resources') : join(dirname(executable), 'resources');
  const cli = join(resources, 'app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
  await promisify(execFile)(executable, ['--expose-internals', cli, 'plugin', '--profile', 'desktop', 'add', fixture, '--save-exact', '--ignore-scripts'], {
    cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: join(opened.directory, 'home') }, windowsHide: true, timeout: 60000 });
  for (let i = 0; i < 100; i++) { try { await stat(marker); break; } catch { await delay(100); } }
  assert.equal(await readFile(marker, 'utf8'), 'loaded');
  const second = await windows.open(plan, { mode: 'read-only', keep: false, signal: AbortSignal.timeout(120000) });
  assert.equal(second.status, 'ready'); assert.notEqual(second.processId, opened.processId);
  assert.notEqual(second.directory, opened.directory);
  for (let i = 0; i < 100 && calls === 0; i++) await delay(100);
  assert(calls > 0, 'Initial task must reach the local fixture model');
  assert.equal(windows.active(opened.id), true, 'First turn must not close the interactive environment');
  const evidence = await readFile(join(root, 'environments', `${opened.id}.json`), 'utf8');
  assert(!evidence.includes('token='), 'Process authentication token must not be persisted');
  const closed = await windows.close(opened.id, 'window-smoke');
  assert.equal(closed.status, 'closed'); assert.equal(closed.cleanup, 'removed');
  await assert.rejects(stat(opened.directory));
  assert.throws(() => process.kill(opened.processId, 0));
  process.kill(second.processId, 0);
  assert.equal(windows.active(second.id), true);
  const secondClosed = await windows.close(second.id, 'window-smoke');
  assert.equal(secondClosed.cleanup, 'removed');
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(windows.open(plan, { mode: 'read-only', keep: false, signal: cancelled.signal }));
  console.log('独立 DSH Desktop：官方客户端、独立 profile、初始对话、CLI 安装与实际加载、两个实例并存、唤回原窗口、会话所有权、进程关闭与清理、取消启动，通过。');
} finally {
  await windows.dispose(); model.closeAllConnections(); await new Promise(done => model.close(done));
  await rm(root, { recursive: true, force: true });
}
