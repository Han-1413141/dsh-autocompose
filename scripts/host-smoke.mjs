import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { builtins, RUNTIME_VERSION, createPlan, runPlan } from '../lib/core.js';

const root = await mkdtemp(join(tmpdir(), 'dsh-toolkit-host-'));
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const requests = [];
let scenario = 'plugins';
const cancellation = new AbortController();
function stream(content, stopReason) {
  return [
    { type: 'message_start', message: { id: `smoke-${requests.length}`, model: 'deepseek-v4-flash', usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: content },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  ].map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}
const server = createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    const value = JSON.parse(body); requests.push({ scenario, body: value });
    if (scenario === 'cancel') { cancellation.abort(); return; }
    const turn = requests.filter(x => x.scenario === scenario).length;
    let content, reason;
    if (scenario === 'plugins' && turn === 1) {
      content = { type: 'tool_use', id: 'compose-call', name: 'autocompose', input: { action: 'plan', task: '检查代码和 Git 仓库' } }; reason = 'tool_use';

    } else { content = { type: 'text', text: scenario === 'plugins' ? 'plugin-tools-ok' : 'isolated-runtime-ok' }; reason = 'end_turn'; }
    response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(stream(content, reason));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const patch = join(root, 'plugins.patch.yml');
await writeFile(patch, stringify([{ insert: [
  { id: 'test-autocompose', name: resolve('lib/index.js'), config: { root: join(root, 'plans') } },
] }]));
const env = { ...process.env, DSH_HOME: join(root, 'host'), DSH_TELEMETRY_DISABLED: '1',
  DEEPSEEK_API_KEY: 'local-smoke-fixture', DEEPSEEK_BASE_URL: endpoint, DSH_PRIMARY_RUNTIME: '' };
let harness;
const previousKey = process.env.DEEPSEEK_API_KEY, previousUrl = process.env.DEEPSEEK_BASE_URL;
try {
  harness = new DeepSeekHarness({ dshBin: cli, dshHome: env.DSH_HOME, cwd: root, processCwd: root, env,
    patches: [patch], initializeTimeoutMs: 30000, requestTimeoutMs: 60000 });
  const result = await harness.run('Exercise the autocompose tool using the local fixture.');
  assert.equal(result.finalResponse, 'plugin-tools-ok');
  const toolNames = requests[0].body.tools.map(x => x.name);
  assert(toolNames.includes('autocompose'));
  const toolResults = result.events.filter(event => event.type === 'tool/result');
  assert.equal(toolResults.length, 1);
  for (const event of toolResults) assert.notEqual(event.data.message.isError, true, JSON.stringify(event));
  const plans = await readdir(join(root, 'plans', 'plans'));
  const plan = JSON.parse(await readFile(join(root, 'plans', 'plans', plans[0]), 'utf8'));
  assert.deepEqual(plan.missing, []); assert.equal(plan.cwd, root);
  console.log('真实 DSH 宿主：AutoCompose 已加载，plan 工具调用成功。');
  await harness.close(); harness = undefined;

  scenario = 'runner';
  process.env.DEEPSEEK_API_KEY = 'local-smoke-fixture'; process.env.DEEPSEEK_BASE_URL = endpoint;
  const stages = [];
  const run = await runPlan(createPlan({ task: '检查代码', cwd: root, runtimeVersion: RUNTIME_VERSION, catalog: builtins }),
    { root: join(root, 'runner'), timeoutMs: 60000, envKeys: ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'], onProgress: x => stages.push(x.stage) });
  assert.equal(run.status, 'completed', JSON.stringify(run));
  assert.equal(run.finalResponse, 'isolated-runtime-ok'); assert.equal(run.cleanup, 'removed');
  assert.deepEqual(await readdir(join(root, 'runner', 'runs')), []);
  assert.deepEqual(stages, ['preparing', 'checking', 'executing', 'cleaning', 'finished']);
  console.log('真实官方 SDK：独立 DSH_HOME → 任务执行 → 返回结果 → 自动清理通过。');
  scenario = 'cancel';
  const cancelled = await runPlan(createPlan({ task: '检查代码', cwd: root, runtimeVersion: RUNTIME_VERSION, catalog: builtins }),
    { root: join(root, 'runner'), timeoutMs: 30000, envKeys: ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'], signal: cancellation.signal });
  assert.equal(cancelled.status, 'cancelled', JSON.stringify(cancelled));
  assert.equal(cancelled.cleanup, 'removed');
  assert.deepEqual(await readdir(join(root, 'runner', 'runs')), []);
  console.log('真实官方 SDK：模型请求期间取消任务，子运行时退出并清理环境。');
  console.log(`验证宿主版本 ${RUNTIME_VERSION}；模型为本地 HTTP 测试替身，未调用付费 API。`);
} finally {
  await harness?.close();
  if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  if (previousUrl === undefined) delete process.env.DEEPSEEK_BASE_URL; else process.env.DEEPSEEK_BASE_URL = previousUrl;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (process.env.KEEP_SMOKE_FIXTURES === '1') console.log(`fixture retained: ${root}`);
  else await rm(root, { recursive: true, force: true });
}
