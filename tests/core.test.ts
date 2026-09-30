import test from 'node:test';

import assert from 'node:assert/strict';

import { spawn } from 'node:child_process';

import { once } from 'node:events';

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { checkCompatibility } from '../shared/compatibility.ts';

import { childEnvironment, runProcess } from '../shared/process.ts';

import { removeOwnedRun, writeJson } from '../shared/files.ts';

import { scanProfile } from '../shared/profile.ts';

import { createPlan, loadPlan, savePlan } from '../src/planner.ts';

import { builtins, RUNTIME_VERSION, type Candidate } from '../src/catalog.ts';

import { savePreset, loadPreset, runPlan } from '../src/runner.ts';

import type { PluginRecord } from '../shared/types.ts';

import { ComposeController } from '../src/controller.ts';

import { TYPERT } from '../src/typert.ts';

import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader';

const plugin = (name: string, patch: Partial<PluginRecord> = {}): PluginRecord => ({ name, version: '1.0.0', enabled: true,
  removable: true, protected: false, rowIds: [], manifest: { peerDependencies: { '@deepseek-ai/dsh-tools': '>=0.2.0-rc.1 <0.3.0' } }, ...patch });

const candidate = (name: string, capabilities: string[], metadata = {}): Candidate => ({ name, version: '1.0.0', source: 'npm',
  description: name, capabilities, permissions: ['workspace-read'], manifest: { ...plugin(name).manifest, dshCompat: metadata } });

async function temporary(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-toolkit-test-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}

test('版本检查与官方预发布范围语义一致，升级时只隔离不兼容插件', () => {
  const good = plugin('good'), old = plugin('old', { manifest: { peerDependencies: { '@deepseek-ai/dsh-tools': '<0.2.0-0' } } });
  const report = checkCompatibility([old, good], RUNTIME_VERSION);
  assert.deepEqual(report.quarantine, ['old']); assert.equal(report.findings[0].code, 'dsh-version');
  assert.equal(checkCompatibility([good], '0.3.0').quarantine[0], 'good');
});

test('缺失兼容声明只警告，禁用项不影响运行', () => {
  const report = checkCompatibility([plugin('unknown', { manifest: {} }), plugin('disabled', { enabled: false, loadError: 'broken' })], RUNTIME_VERSION);
  assert.equal(report.findings[0].severity, 'warning'); assert.deepEqual(report.quarantine, []);
});

test('重复顶层条目、工具和服务保留优先级较高者', () => {
  const a = plugin('a', { rowIds: ['same'], manifest: { dshCompat: { tools: ['read_pdf'], services: ['pdf'], priority: 10 } } });
  const b = plugin('b', { rowIds: ['same'], manifest: { dshCompat: { tools: ['read_pdf'], services: ['pdf'] } } });
  const report = checkCompatibility([a, b], RUNTIME_VERSION);
  assert.deepEqual(report.quarantine, ['b']);
  assert.equal(report.findings.filter(x => x.code.startsWith('duplicate')).length, 3);
});

test('依赖级联停用，并保护官方组件', () => {
  const core = plugin('@deepseek-ai/core', { protected: true, manifest: { dshCompat: { conflicts: { bad: '*' } } } });
  const bad = plugin('bad');
  const dependent = plugin('dependent', { manifest: { dshCompat: { requires: { bad: '^1.0.0' } } } });
  const report = checkCompatibility([core, bad, dependent], RUNTIME_VERSION);
  assert.deepEqual(report.quarantine, ['bad', 'dependent']); assert.deepEqual(report.unresolved, []);
});

test('受保护组件自身失败必须作为未解决问题返回', () => {
  const report = checkCompatibility([plugin('protected', { protected: true, loadError: 'boom' })], RUNTIME_VERSION);
  assert.equal(report.unresolved.length, 1); assert.deepEqual(report.quarantine, []);
});

test('Node、系统限制和错误元数据均产生可定位结果', () => {
  const rows = [plugin('node', { manifest: { engines: { node: '>=99' } } }),
    plugin('os', { manifest: { os: ['!win32'] } }), plugin('bad-range', { manifest: { dshCompat: { dsh: 'tomorrow' } } })];
  const report = checkCompatibility(rows, RUNTIME_VERSION, { platform: 'win32' });
  assert.equal(report.findings.filter(x => x.severity === 'error').length, 3);
});

test('旧核心直接依赖和损坏的标准字段被定位到对应插件', () => {
  const rows = [plugin('old-stack', { manifest: { dependencies: { '@deepseek-ai/dsh-tools': '^0.0.1-rc.1' } } }),
    plugin('malformed', { manifest: { os: 'win32' } as unknown as PluginRecord['manifest'] }), plugin('healthy')];
  const report = checkCompatibility(rows, RUNTIME_VERSION);
  assert(report.findings.some(x => x.code === 'embedded-runtime'));
  assert(report.findings.some(x => x.code === 'invalid-metadata' && x.plugins[0] === 'malformed'));
  assert(!report.quarantine.includes('healthy'));
});

test('规划结合能力覆盖、依赖和权限，排除版本冲突', () => {
  const wrong = candidate('bad-pdf', ['pdf']); wrong.manifest.peerDependencies = { '@deepseek-ai/dsh': '<0.1.0' };
  const pdf = candidate('pdf', ['pdf'], { requires: { parser: '^1' } });
  const plan = createPlan({ task: '读取 PDF，分析仓库并联网查文档', cwd: process.cwd(), runtimeVersion: RUNTIME_VERSION,
    catalog: [...builtins, wrong, pdf, candidate('parser', [])] });
  assert.deepEqual(plan.missing, []);
  assert(plan.selected.some(x => x.name === 'parser')); assert(!plan.selected.some(x => x.name === 'bad-pdf'));
});

test('缺失能力不能伪装成已组装；循环依赖不会使规划无限递归', () => {
  const plan = createPlan({ task: '读取 PDF', cwd: process.cwd(), runtimeVersion: RUNTIME_VERSION,
    catalog: [...builtins, candidate('a', ['pdf'], { requires: { b: '*' } }), candidate('b', [], { requires: { a: '*' } })] });
  assert.deepEqual(plan.missing, ['pdf']);
});

test('计划保存、校验与预设复用，拒绝篡改', async t => {
  const root = await temporary(t);
  const plan = createPlan({ task: '检查代码', cwd: root, runtimeVersion: RUNTIME_VERSION, catalog: builtins });
  await savePlan(root, plan); assert.equal((await loadPlan(root, plan.id)).fingerprint, plan.fingerprint);
  await savePreset(root, 'code-review', plan);
  const reused = await loadPreset(root, 'code-review', '检查另一段代码');
  assert.notEqual(reused.id, plan.id); assert.notEqual(reused.fingerprint, plan.fingerprint);
  await writeJson(join(root, 'plans', `${plan.id}.json`), { ...plan, task: 'changed' });
  await assert.rejects(loadPlan(root, plan.id), /计划内容已变化/);
  await assert.rejects(runPlan({ ...plan, task: 'changed' }, { root }), /计划内容已改变/);
});

test('环境仅传递明确允许的凭据，不传递宿主其他密钥和注入参数', () => {
  const env = childEnvironment(['DEEPSEEK_API_KEY'], { PATH: '/bin', SECRET: 'hidden', NODE_OPTIONS: 'inject', DEEPSEEK_API_KEY: 'test' });
  assert.equal(env.SECRET, undefined); assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.DEEPSEEK_API_KEY, 'test');
  assert.throws(() => childEnvironment(['NODE_OPTIONS']), /不允许/);
});

test('取消会结束实际子进程，失败输出不会被当成成功', async t => {
  const root = await temporary(t);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: root, timeoutMs: 100 }), /abort|timeout/i);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(3)'], { cwd: root }), /退出码 3/);
});

test('临时环境清理要求所有权标记和路径归属', async t => {
  const root = await temporary(t), run = join(root, 'runs', 'one');
  await mkdir(run, { recursive: true }); await writeJson(join(run, '.autocompose-owner.json'), { id: 'one' });
  await assert.rejects(removeOwnedRun(join(root, 'runs'), run, 'other'), /标记不匹配/);
  await assert.rejects(removeOwnedRun(run, root, 'one'), /路径超出/);
  await removeOwnedRun(join(root, 'runs'), run, 'one');
});

test('更换预设任务重新计算能力，不能把 PDF 需求当成已满足', async t => {
  const root = await temporary(t);
  await savePreset(root, 'review', createPlan({ task: '检查代码', cwd: root, runtimeVersion: RUNTIME_VERSION, catalog: builtins }));
  const reused = await loadPreset(root, 'review', '读取 PDF');
  assert.deepEqual(reused.missing, ['pdf']);
  await assert.rejects(runPlan(reused, { root }), /缺少能力/);
});

test('浏览器规划只接受已定义操作并在宿主保留任务，取消可以收尾', async t => {
  const root = await temporary(t), controller = new ComposeController({ root, autoDiscover: false });
  t.after(() => controller.dispose());
  await assert.rejects(controller.request(JSON.stringify({ action: 'start', planId: '../other', fingerprint: 'x'.repeat(64), mode: 'read-only', keep: false })));
  await assert.rejects(controller.request(JSON.stringify({ action: 'overview', command: 'arbitrary' })));
  const job = JSON.parse(await controller.request(JSON.stringify({ action: 'plan', task: '检查代码', cwd: root })));
  await controller.request(JSON.stringify({ action: 'cancel', jobId: job.id }));
  await controller.dispose();
  assert.equal((await controller.overview()).jobs[0].status, 'cancelled');
  await assert.rejects(controller.request(JSON.stringify({ action: 'overview' })), /关闭/);
});

test('重启后的未结束任务显示中断，损坏记录不阻塞其余历史', async t => {
  const root = await temporary(t), controller = new ComposeController({ root, autoDiscover: false });
  await writeJson(join(root, 'history', 'valid.json'), { id: 'previous', status: 'running', cleanup: 'pending', directory: join(root, 'runs', 'previous') });
  await writeFile(join(root, 'history', 'broken.json'), '{broken');
  const view = await controller.overview();
  assert.equal(view.history[0].status, 'interrupted'); assert.equal(view.notices.length, 1);
});

test('其他进程的运行不会被页面误报为中断，退出后才显示中断', async t => {
  const root = await temporary(t), controller = new ComposeController({ root, autoDiscover: false });
  const worker = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  await once(worker, 'spawn');
  t.after(() => { worker.kill(); });
  await writeJson(join(root, 'history', 'other.json'), { id: 'other-process', processId: worker.pid, status: 'running' });
  assert.equal((await controller.overview()).history[0].status, 'running');
  const exited = once(worker, 'exit'); worker.kill(); await exited;
  assert.equal((await controller.overview()).history[0].status, 'interrupted');
});

test('RPC 描述通过实际 DSH 的严格工厂验证', () => {
  const validated = validateTypertManifest('dsh-autocompose', TYPERT);
  assert.equal(validated.invocations[0].service, 'autocomposeUI');
  const codec = TYPERT.invocations[0].parameters[0].codec;
  assert.equal(codec.create().safeParse('ok').success, true);
  assert.equal(codec.create().safeParse({ command: 'wrong wire type' }).success, false);
});
