/** Real DSH web host in a disposable profile; the only model endpoint is a local fixture. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const root = await mkdtemp(join(tmpdir(), 'dsh-toolkit-ui-'));
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const model = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const events = [
      { type: 'message_start', message: { id: 'ui-fixture', model: 'deepseek-v4-flash', usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '已完成本地集成验证。\n\n插件组合已加载，任务目录保持只读，运行结果已记录。\n这是本地测试模型的固定回复，不代表真实代码审查结果。' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } },
      { type: 'message_stop' },
    ];
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
    }, 3500);
  });
});
await new Promise(done => model.listen(0, '127.0.0.1', done));
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_PRIMARY_RUNTIME: '', DSH_TELEMETRY_DISABLED: '1',
  DEEPSEEK_API_KEY: 'local-ui-fixture', DEEPSEEK_BASE_URL: `http://127.0.0.1:${model.address().port}` };
const fixtureNames = ['dsh-demo-reader', 'dsh-demo-reader-legacy', 'dsh-demo-upgrade'];
for (const name of fixtureNames) {
  const directory = join(root, name); await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } }, dshCompat: name === 'dsh-demo-upgrade' ? { dsh: '<0.3.0-0' } : { tools: ['demo-read-document'] } }));
  await writeFile(join(directory, 'index.js'), 'export function apply() {}\n');
  await writeFile(join(directory, 'cordis.patch.yml'), stringify([{ insert: [{ id: name, name }] }]));
}
let child;
const stop = async () => {
  if (child?.exitCode === null) {
    if (process.platform === 'win32') await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
    else child.kill('SIGTERM');
    await new Promise(done => { if (child.exitCode !== null) done(); else child.once('exit', done); });
  }
  model.closeAllConnections(); await new Promise(done => model.close(done));
  if (process.env.KEEP_UI_FIXTURES !== '1') await rm(root, { recursive: true, force: true });
};
try {
  await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', ...fixtureNames.map(x => join(root, x)), '--ignore-scripts'], { env, cwd: root, windowsHide: true, timeout: 90000 });
  const patch = join(root, 'ui.patch.yml');
  await writeFile(patch, stringify([{ insert: [
    { id: 'autocompose-ui-test', name: resolve('lib/index.js'), config: { root: join(root, 'autocompose'), autoDiscover: false, envKeys: ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'] } },
  ] }]));
  child = spawn(process.execPath, [cli, '--profile', 'web', '--patch', patch, '--no-open', '--port', '0'], { env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', x => process.stdout.write(x)); child.stderr.on('data', x => process.stderr.write(x));
  await mkdir('.test-output', { recursive: true });
  await writeFile('.test-output/ui-session.json', JSON.stringify({ root, pid: child.pid, workspace: process.cwd() }));
  console.log(`UI fixture: ${root}`);
  await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => { process.once('SIGINT', done); process.once('SIGTERM', done); })]);
} finally { await stop(); }
