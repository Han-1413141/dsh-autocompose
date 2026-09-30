/** Real DSH + official Plugin Manager, with local no-op packages in a disposable profile. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const root = await mkdtemp(join(tmpdir(), 'dsh-compose-main-'));
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const ui = process.argv.includes('--ui');
const reportPath = join(root, 'report.json'), fixturePath = join(root, 'fixtures.json');
const fixtures = [];
for (const [key, name, version, capabilities, extra, row] of [
  ['helper', 'dsh-compose-fixture-helper', '1.0.0', [], {}, 'compose-helper'],
  ['reader', 'dsh-compose-fixture-reader', '1.0.0', ['pdf'], { requires: { 'dsh-compose-fixture-helper': '^1.0.0' }, tools: ['compose-read-pdf'] }, 'compose-reader'],
  ['reader-next', 'dsh-compose-fixture-reader', '1.1.0', ['pdf'], { requires: { 'dsh-compose-fixture-helper': '^1.0.0' }, tools: ['compose-read-pdf'] }, 'compose-reader'],
  ['conflict', 'dsh-compose-fixture-conflict', '1.0.0', ['vision'], { tools: ['compose-read-pdf'] }, 'compose-conflict'],
  ['row-conflict', 'dsh-compose-fixture-row-conflict', '1.0.0', ['memory'], {}, 'compose-helper'],
]) {
  const directory = join(root, key); await mkdir(directory);
  const manifest = { name, version, type: 'module', main: 'index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } }, dshCompat: { dsh: '0.2.0-rc.2', capabilities, permissions: [], ...extra } };
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(directory, 'index.js'), 'export function apply() {}\n');
  await writeFile(join(directory, 'cordis.patch.yml'), stringify([{ insert: [{ id: row, name }] }]));
  fixtures.push({ key, directory, manifest });
}
await writeFile(fixturePath, JSON.stringify({ root, reportPath, ui, fixtures }));
const catalog = join(root, 'catalog.json');
await writeFile(catalog, JSON.stringify({ schemaVersion: 1, plugins: fixtures.filter(x => x.key !== 'reader-next').map(x => ({
  name: x.manifest.name, version: x.manifest.version, capabilities: x.manifest.dshCompat.capabilities })) }));
const patch = join(root, 'test.patch.yml');
await writeFile(patch, stringify([{ insert: [
  { id: 'autocompose-main-test', name: resolve('lib/index.js'), config: { root: join(root, 'state'), autoDiscover: false, catalog } },
  { id: 'main-install-observer', name: resolve('tests/fixtures/main-install-observer.mjs') },
] }]));
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_PRIMARY_RUNTIME: '', DSH_TELEMETRY_DISABLED: '1', DSH_AUTOCOMPOSE_FIXTURE: fixturePath };
delete env.DEEPSEEK_API_KEY;
let child, logs = '';
try {
  await promisify(execFile)(process.execPath, [cli, '--profile', 'web', '--dump-config'], { env, cwd: root, windowsHide: true, timeout: 90000 });
  child = spawn(process.execPath, [cli, '--profile', 'web', '--patch', patch, '--no-open', '--port', '0'], { env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', x => { logs = (logs + x).slice(-64000); if (ui) process.stdout.write(x); });
  if (ui) {
    console.log(`Local fixture UI: ${root}`);
    await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => { process.once('SIGINT', done); process.once('SIGTERM', done); })]);
  } else {
    const deadline = Date.now() + 120000; let report;
    while (Date.now() < deadline) {
      try { report = JSON.parse(await readFile(reportPath, 'utf8')); break; } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      if (child.exitCode !== null) throw new Error(`Host exited: ${child.exitCode}\n${logs}`);
      await new Promise(done => setTimeout(done, 250));
    }
    await mkdir('.test-output', { recursive: true });
    await writeFile('.test-output/main-install-host.log', logs.replace(/\?token=[^\s]+/g, '?token=<redacted>'));
    if (!report) throw new Error('Main installation integration timed out; see .test-output/main-install-host.log');
    await writeFile('.test-output/main-install-report.json', JSON.stringify(report, null, 2));
    if (!report.ok) throw new Error(report.error);
    console.log('真实 DSH 主环境：页面 API → 安装预览 → 官方 Plugin Manager → 实际加载两包，通过。');
    console.log('同版本复用、停用后启用、版本替换与重启提示、工具冲突拦截、安装后条目冲突拦截，通过。');
    console.log('使用临时 profile、无业务逻辑的本地包；未调用模型，未修改日常 DSH 环境。');
  }
} finally {
  if (child?.exitCode === null) {
    if (process.platform === 'win32') await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
    else child.kill('SIGTERM');
    await new Promise(done => { if (child.exitCode !== null) done(); else child.once('exit', done); });
  }
  // root is created here by mkdtemp and never replaced with a user-supplied path.
  if (process.env.KEEP_MAIN_FIXTURES === '1') console.log(`Retained fixture: ${root}`);
  else await rm(root, { recursive: true, force: true });
}
