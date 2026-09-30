import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ChangeResult } from '@deepseek-ai/dsh-plugin-manager';
import { HostInstaller } from '../src/host-install.ts';
import { packageMetadata, RUNTIME_VERSION, type Candidate } from '../src/catalog.ts';
import { candidateRecord, createPlan, savePlan } from '../src/planner.ts';
import { ComposeController } from '../src/controller.ts';
import { digest } from '../shared/files.ts';
import type { CompatMetadata, PluginRecord } from '../shared/types.ts';

function candidate(name: string, capabilities = ['pdf'], meta: CompatMetadata = {}, version = '1.0.0'): Candidate {
  const manifest = packageMetadata({ name, version, dsh: { bundle: { patch: './cordis.patch.yml' } },
    dshCompat: { dsh: RUNTIME_VERSION, ...meta } });
  return { name, version, source: 'npm', capabilities, permissions: ['workspace-read'], description: name,
    manifest, integrity: 'sha512-fixture', metadataHash: digest(JSON.stringify(manifest)) };
}
const result = (target: string, stage: ChangeResult['stage'] = 'install', application: ChangeResult['application'] = 'applied'): ChangeResult =>
  ({ target, stage, application, changed: true });
async function setup(t: TestContext, catalog = [candidate('dsh-test-reader')], initial: PluginRecord[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-main-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }));
  const rows = structuredClone(initial), calls: string[] = [];
  const manager: ConstructorParameters<typeof HostInstaller>[0] = {
    async installBundle(spec, options) {
      calls.push(`install:${spec}`); assert.equal(options?.enabled, false);
      assert.equal(options?.registry, 'https://registry.npmjs.org'); assert.equal(options?.approvedBuilds, undefined);
      assert(options?.requestId);
      const found = catalog.find(x => `${x.name}@${x.version}` === spec)!;
      assert(found); const index = rows.findIndex(x => x.name === found.name);
      const row = { ...candidateRecord(found), enabled: false };
      if (index < 0) rows.push(row); else rows[index] = row;
      return result(found.name);
    },
    async setBundleEnabled(name, enabled) {
      calls.push(`enable:${name}`); rows.find(x => x.name === name)!.enabled = enabled;
      return result(name, 'enable');
    },
    async cancelInstall() { calls.push('cancel'); return { status: 'cancelled' }; },
  };
  const options = { root: join(root, 'state'), directory: root, profile: 'fixture', runtimeVersion: RUNTIME_VERSION,
    scan: async () => structuredClone(rows), inspect: async (name: string, version: string) => structuredClone(catalog.find(x => x.name === name && x.version === version)!) };
  const installer = new HostInstaller(manager, options);
  const plan = createPlan({ task: '读取 PDF', cwd: root, owner: 'web-ui', runtimeVersion: RUNTIME_VERSION, catalog, capabilities: ['pdf'] });
  return { root, rows, calls, catalog, manager, installer, plan, options };
}

test('新增插件：固定版本、配置备份、安装后启用并持久保存结果', async t => {
  const f = await setup(t), preview = await f.installer.preview(f.plan);
  assert.equal(preview.items[0].action, 'install');
  const record = await f.installer.install(preview.id, 'web-ui');
  assert.equal(record.status, 'completed'); assert.equal(record.items[0].state, 'enabled');
  assert.deepEqual(f.calls, ['install:dsh-test-reader@1.0.0', 'enable:dsh-test-reader']);
  assert.equal(JSON.parse(await readFile(record.backupPath!, 'utf8')).target.directory, f.root);
  assert.equal(JSON.parse(await readFile(join(f.options.root, 'installations', `${record.id}.json`), 'utf8')).status, 'completed');
  await assert.rejects(f.installer.install(preview.id, 'web-ui'), /失效/);
});

test('同版本复用或只启用，不重复安装；版本替换明确显示并保留重启提示', async t => {
  for (const [enabled, version, action] of [[true, '1.0.0', 'reuse'], [false, '1.0.0', 'enable'], [true, '0.9.0', 'replace']] as const) {
    const c = candidate('dsh-test-reader');
    const f = await setup(t, [c], [{ ...candidateRecord(candidate(c.name, ['pdf'], {}, version)), enabled }]);
    const install = f.manager.installBundle;
    f.manager.installBundle = async (...args) => ({ ...await install(...args), application: 'restart-required' });
    const preview = await f.installer.preview(f.plan); assert.equal(preview.items[0].action, action);
    const record = await f.installer.install(preview.id, 'web-ui'); assert.equal(record.status, 'completed');
    assert.equal(f.calls.filter(x => x.startsWith('install')).length, action === 'replace' ? 1 : 0);
    assert.equal(record.restartRequired, action === 'replace');
    if (action === 'reuse') { assert.deepEqual(f.calls, []); assert.equal(record.backupPath, undefined); }
  }
});

test('主环境已有工具冲突会阻止安装，无关的历史错误仍可查看', async t => {
  const old = candidateRecord(candidate('dsh-old', [], { tools: ['read-pdf'] }));
  const f = await setup(t, [candidate('dsh-test-reader', ['pdf'], { tools: ['read-pdf'] })], [old]);
  const preview = await f.installer.preview(f.plan); assert(preview.blockers.length);
  await assert.rejects(f.installer.install(preview.id, 'web-ui'), /read-pdf/); assert.deepEqual(f.calls, []);
  const g = await setup(t, undefined, [{ ...old, manifest: { dshCompat: { dsh: '<0.1.0' } } }]);
  const unrelated = await g.installer.preview(g.plan);
  assert(unrelated.findings.some(x => x.severity === 'error')); assert.deepEqual(unrelated.blockers, []);
});

test('主环境变更、跨会话使用和被篡改方案在写入前被拒绝', async t => {
  const f = await setup(t), preview = await f.installer.preview(f.plan);
  await assert.rejects(f.installer.install(preview.id, 'another-session'), /其他会话/);
  await writeFile(join(f.root, 'cordis.patch.yml'), '[]\n');
  await assert.rejects(f.installer.install(preview.id, 'web-ui'), /发生变化/);
  await assert.rejects(f.installer.preview({ ...f.plan, task: 'changed' }), /内容已变化/);
  assert.deepEqual(f.calls, []);
});

test('缺项、受保护管理组件和变化的发布内容在首次安装前被拒绝', async t => {
  const f = await setup(t, []); await assert.rejects(f.installer.preview(f.plan), /缺少能力/);
  const g = await setup(t, [candidate('dsh-compat-guardian')]); await assert.rejects(g.installer.preview(g.plan), /管理插件/);
  const h = await setup(t), preview = await h.installer.preview(h.plan);
  h.catalog[0].integrity = 'sha512-changed';
  const record = await h.installer.install(preview.id, 'web-ui');
  assert.equal(record.status, 'failed'); assert.match(record.error!, /发布内容已变化/); assert.deepEqual(h.calls, []);
});

test('所有包安装后才启用，并先启用声明的前置依赖', async t => {
  const f = await setup(t, [candidate('dsh-reader', ['pdf'], { requires: { 'dsh-helper': '^1.0.0' } }), candidate('dsh-helper', [])]);
  const preview = await f.installer.preview(f.plan);
  const record = await f.installer.install(preview.id, 'web-ui'); assert.equal(record.status, 'completed');
  assert.deepEqual(f.calls, ['install:dsh-reader@1.0.0', 'install:dsh-helper@1.0.0', 'enable:dsh-helper', 'enable:dsh-reader']);
});

test('后续安装失败保留并记录已经安装的包，不授予构建脚本权限', async t => {
  const f = await setup(t, [candidate('dsh-reader', ['pdf'], { requires: { 'dsh-helper': '*' } }), candidate('dsh-helper', [])]);
  const install = f.manager.installBundle;
  f.manager.installBundle = async (spec, options) => spec.startsWith('dsh-helper@') ?
    { ...result(spec, 'install', 'failed'), changed: false, pendingBuilds: ['native-addon'] } : install(spec, options);
  const record = await f.installer.install((await f.installer.preview(f.plan)).id, 'web-ui');
  assert.equal(record.status, 'partial'); assert.equal(record.items[0].state, 'installed');
  assert.match(record.error!, /构建授权/); assert.equal(f.calls.filter(x => x.startsWith('enable')).length, 0);
});

test('安装后包声明不一致或实际条目冲突均停止启用', async t => {
  for (const kind of ['metadata', 'rows']) {
    const f = await setup(t, undefined, [candidateRecord(candidate('dsh-other', []))]);
    f.rows[0].rowIds = ['shared-row']; const install = f.manager.installBundle;
    f.manager.installBundle = async (...args) => {
      const value = await install(...args), row = f.rows.find(x => x.name === 'dsh-test-reader')!;
      if (kind === 'metadata') row.manifest.description = 'unexpected'; else row.rowIds = ['shared-row'];
      return value;
    };
    const record = await f.installer.install((await f.installer.preview(f.plan)).id, 'web-ui');
    assert.equal(record.status, 'partial'); assert.match(record.error!, kind === 'metadata' ? /声明与方案不符/ : /安装后检查/);
    assert.equal(f.calls.filter(x => x.startsWith('enable')).length, 0);
  }
});

test('取消会等待官方取消结束，之后不再启用插件', async t => {
  const f = await setup(t), abort = new AbortController(); let cancelled!: () => void;
  f.manager.installBundle = async spec => {
    queueMicrotask(() => abort.abort()); await new Promise<void>(resolve => { cancelled = resolve; });
    return { ...result(spec, 'install', 'cancelled'), changed: false };
  };
  f.manager.cancelInstall = async () => { f.calls.push('cancel'); cancelled(); return { status: 'cancelled' }; };
  const record = await f.installer.install((await f.installer.preview(f.plan)).id, 'web-ui', { signal: abort.signal });
  assert.equal(record.status, 'cancelled'); assert.deepEqual(f.calls, ['cancel']);
});

test('启用失败时保留实际保存的状态，不报告整体完成', async t => {
  const f = await setup(t), enable = f.manager.setBundleEnabled;
  f.manager.setBundleEnabled = async (...args) => ({ ...await enable(...args), application: 'failed', error: { code: 'operation-error', diagnostic: 'fixture reload failed' } });
  const record = await f.installer.install((await f.installer.preview(f.plan)).id, 'web-ui');
  assert.equal(record.status, 'partial'); assert.equal(record.items[0].state, 'enabled'); assert.match(record.error!, /reload failed/);
});

test('页面安装由宿主持续执行，overview 返回目标环境和安装记录', async t => {
  const f = await setup(t); await savePlan(f.options.root, f.plan);
  const controller = new ComposeController({ root: f.options.root, installer: f.installer });
  t.after(() => controller.dispose());
  const request = async (value: unknown) => JSON.parse(await controller.request(JSON.stringify(value)));
  const preview = await request({ action: 'previewInstall', planId: f.plan.id, fingerprint: f.plan.fingerprint });
  const job = await request({ action: 'install', previewId: preview.id }); assert.equal(job.kind, 'install');
  for (let i = 0; i < 100; i++) {
    if ((await controller.overview()).jobs[0].status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const overview = await controller.overview(); assert.equal(overview.jobs[0].status, 'completed');
  assert.equal(overview.mainEnvironment?.directory, f.root); assert.equal(overview.installations[0].status, 'completed');
  await assert.rejects(request({ action: 'install', previewId: preview.id, directory: 'C:/arbitrary' }), /参数|Unrecognized|unrecognized/);
});
