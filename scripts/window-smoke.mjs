/** Real Web runtime, local model only, and a disposable profile. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPlan, builtins, RUNTIME_VERSION, WebEnvironments } from '../lib/core.js';
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
const windows = new WebEnvironments({ root, envKeys: ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'] });
try {
  const plan = createPlan({ task: '检查代码', cwd: root, owner: 'window-smoke', runtimeVersion: RUNTIME_VERSION, catalog: builtins });
  const opened = await windows.open(plan, { mode: 'read-only', keep: false, signal: AbortSignal.timeout(120000) });
  assert.equal(opened.status, 'ready'); assert(opened.sessionId, JSON.stringify(opened));
  const url = windows.url(opened.id, 'window-smoke');
  assert.throws(() => windows.url(opened.id, 'another-session'), /关闭/);
  const handoff = await fetch(url, { redirect: 'manual' });
  const cookie = handoff.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const response = handoff.status >= 300 && handoff.status < 400 ? await fetch(new URL('/', url), { headers: { cookie } }) : handoff;
  assert(response.ok, `Web response ${response.status}: ${(await response.clone().text()).slice(0, 400)}`);
  assert.match(await response.text(), /__DSH_BOOT__/);
  for (let i = 0; i < 100 && calls === 0; i++) await delay(100);
  assert(calls > 0, 'Initial task must reach the local fixture model');
  assert.equal(windows.active(opened.id), true, 'First turn must not close the interactive environment');
  const evidence = await readFile(join(root, 'environments', `${opened.id}.json`), 'utf8');
  assert(!evidence.includes('token='), 'Process authentication token must not be persisted');
  const closed = await windows.close(opened.id, 'window-smoke');
  assert.equal(closed.status, 'closed'); assert.equal(closed.cleanup, 'removed');
  await assert.rejects(stat(opened.directory));
  await assert.rejects(fetch(url, { signal: AbortSignal.timeout(2000) }));
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(windows.open(plan, { mode: 'read-only', keep: false, signal: cancelled.signal }));
  console.log('独立 DSH Web：实际页面、初始对话、持续运行、会话所有权、关闭进程与目录清理、取消启动，通过。');
} finally {
  await windows.dispose(); model.closeAllConnections(); await new Promise(done => model.close(done));
  await rm(root, { recursive: true, force: true });
}
