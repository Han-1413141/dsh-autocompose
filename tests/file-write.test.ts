import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJson } from '../shared/files.ts';

test('Windows 读取者短暂占用安装记录时，原子替换等待释放后完成且不留下临时文件', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-file-lock-'));
  const file = join(root, 'record.json'), ready = join(root, 'reader-ready');
  await writeJson(file, { status: 'running' });
  const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$stream = [IO.File]::Open(${quote(file)}, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read); try { [IO.File]::WriteAllText(${quote(ready)}, 'ready'); Start-Sleep -Milliseconds 450 } finally { $stream.Dispose() }`],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-2000); });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null) child.kill(); await exited; await rm(root, { recursive: true, force: true }); });
  const deadline = Date.now() + 15000;
  for (;;) {
    if (await stat(ready).then(() => true, () => false)) break;
    assert(child.exitCode === null && Date.now() < deadline, `fixture reader did not acquire its handle (exit ${child.exitCode}): ${diagnostic}`);
    await new Promise(done => setTimeout(done, 10));
  }
  await writeJson(file, { status: 'completed' });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { status: 'completed' });
  assert.equal((await readdir(root)).filter(x => x.endsWith('.tmp')).length, 0);
});
