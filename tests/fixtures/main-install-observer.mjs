import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createPlan, inspectCandidate, HostInstaller, RUNTIME_VERSION } from '../../lib/core.js';

export const inject = ['pluginManager', 'profileContext', 'autocomposeUI'];
export async function apply(ctx) {
  const path = process.env.DSH_AUTOCOMPOSE_FIXTURE;
  if (!path) throw new Error('Only use this observer in the disposable test host');
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  const rel = relative(fixture.root, ctx.profileContext.dir);
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'refuse to modify a non-fixture profile');
  const manager = ctx.pluginManager, originalInstall = manager.installBundle.bind(manager), originalFetch = globalThis.fetch;
  // Only fixture metadata is substituted. Production always queries public npm; unit tests check exact specs and options.
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    const found = fixture.fixtures.find(x => url === `https://registry.npmjs.org/${x.manifest.name}/${x.manifest.version}`);
    return found ? Response.json({ ...found.manifest, dist: { integrity: `sha512-local-fixture-${found.key}` } }) : originalFetch(input, options);
  };
  manager.installBundle = (spec, options) => {
    const found = fixture.fixtures.find(x => spec === `${x.manifest.name}@${x.manifest.version}`);
    assert(found, `Unexpected fixture install: ${spec}`);
    return originalInstall(found.directory, options);
  };
  let operation;
  const timer = setTimeout(() => {
    if (fixture.ui) return;
    operation = exercise(ctx, fixture).then(value => writeFile(fixture.reportPath, JSON.stringify(value)))
      .catch(error => writeFile(fixture.reportPath, JSON.stringify({ ok: false, error: error.stack })));
  }, 1800);
  ctx.effect(() => async () => { clearTimeout(timer); await operation; manager.installBundle = originalInstall; globalThis.fetch = originalFetch; });
}
async function exercise(ctx, fixture) {
  const request = async args => JSON.parse(await ctx.autocomposeUI.request(JSON.stringify(args)));
  const finish = async () => {
    for (let i = 0; i < 400; i++) {
      const overview = await request({ action: 'overview' }), job = overview.jobs[0];
      if (job && !['running', 'cancelling'].includes(job.status)) {
        assert.equal(job.status, 'completed', JSON.stringify(job)); return job;
      }
      await new Promise(done => setTimeout(done, 100));
    }
    throw new Error('Page job timed out');
  };
  await request({ action: 'plan', task: '读取 PDF', cwd: fixture.root });
  const plan = (await finish()).plan;
  const preview = await request({ action: 'previewInstall', planId: plan.id, fingerprint: plan.fingerprint });
  assert.deepEqual(preview.blockers, []); assert.equal(preview.items.length, 2);
  await request({ action: 'install', previewId: preview.id });
  const installed = (await finish()).install;
  assert.equal(installed.status, 'completed');
  const phases = (await ctx.pluginManager.listPlugins()).filter(x => x.moduleName.startsWith('dsh-compose-fixture-'));
  assert.equal(phases.length, 2); assert(phases.every(x => x.fiberPhase === 'active'), JSON.stringify(phases));
  const reused = await request({ action: 'previewInstall', planId: plan.id, fingerprint: plan.fingerprint });
  assert(reused.items.every(x => x.action === 'reuse'));
  await ctx.pluginManager.setBundleEnabled('dsh-compose-fixture-reader', false);
  const enable = await request({ action: 'previewInstall', planId: plan.id, fingerprint: plan.fingerprint });
  assert.equal(enable.items.find(x => x.name.endsWith('reader')).action, 'enable');
  await request({ action: 'install', previewId: enable.id }); await finish();
  await request({ action: 'plan', task: '识图', cwd: fixture.root });
  const conflicting = (await finish()).plan;
  const conflict = await request({ action: 'previewInstall', planId: conflicting.id, fingerprint: conflicting.fingerprint });
  assert(conflict.blockers.some(x => x.includes('compose-read-pdf')));
  const installer = new HostInstaller(ctx.pluginManager, { root: join(fixture.root, 'state'),
    directory: ctx.profileContext.dir, profile: ctx.profileContext.name, installAnchor: ctx.profileContext.installAnchor, runtimeVersion: RUNTIME_VERSION });
  const selected = await Promise.all(['helper', 'reader-next'].map(async key => {
    const { manifest } = fixture.fixtures.find(x => x.key === key); return inspectCandidate(manifest.name, manifest.version);
  }));
  const upgrade = createPlan({ task: '读取 PDF', cwd: fixture.root, owner: 'upgrade-test', capabilities: ['pdf'], catalog: selected, runtimeVersion: RUNTIME_VERSION });
  const upgradePreview = await installer.preview(upgrade);
  assert.equal(upgradePreview.items.find(x => x.name.endsWith('reader')).action, 'replace');
  const upgraded = await installer.install(upgradePreview.id, 'upgrade-test');
  assert.equal(upgraded.status, 'completed', JSON.stringify(upgraded)); assert.equal(upgraded.restartRequired, true);
  const rowFixture = fixture.fixtures.find(x => x.key === 'row-conflict').manifest;
  const rowPlan = createPlan({ task: 'memory', cwd: fixture.root, owner: 'rows-test', capabilities: ['memory'],
    catalog: [await inspectCandidate(rowFixture.name, rowFixture.version)], runtimeVersion: RUNTIME_VERSION });
  const rowPreview = await installer.preview(rowPlan); assert.deepEqual(rowPreview.blockers, []);
  const rowResult = await installer.install(rowPreview.id, 'rows-test');
  assert.equal(rowResult.status, 'partial'); assert.match(rowResult.error, /安装后检查/);
  assert.equal((await ctx.pluginManager.listBundles()).find(x => x.name === rowFixture.name).enabled, false);
  return { ok: true, installed, active: phases.map(x => ({ name: x.moduleName, phase: x.fiberPhase })),
    reused: reused.items, conflict: conflict.blockers, upgraded, rowResult };
}
