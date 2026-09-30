import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ChangeResult, PluginManager } from '@deepseek-ai/dsh-plugin-manager';
import { digest, optionalText, withLock, writeJson } from '../shared/files.ts';
import { checkCompatibility } from '../shared/compatibility.ts';
import { scanProfile } from '../shared/profile.ts';
import { isProtected, type Finding, type PluginRecord } from '../shared/types.ts';
import { compatMetadata, packageName, version } from '../shared/validation.ts';
import { inspectCandidate, packageMetadata, registryUrl, type Candidate } from './catalog.ts';
import { candidateRecord, type ComposePlan } from './planner.ts';

type Manager = Pick<PluginManager, 'installBundle' | 'setBundleEnabled' | 'cancelInstall'>;
export interface MainEnvironment { profile: string; directory: string; runtimeVersion: string }
export interface InstallItem {
  name: string; version: string; previousVersion?: string;
  action: 'install' | 'replace' | 'enable' | 'reuse'; permissions: string[];
}
export interface InstallPreview {
  id: string; planId: string; task: string; target: MainEnvironment; items: InstallItem[];
  findings: Finding[]; blockers: string[]; fingerprint: string;
}
export interface InstallEvidence {
  id: string; planId: string; task: string; target: MainEnvironment; startedAt: string; finishedAt?: string;
  processId: number; status: 'running' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'interrupted';
  stage: 'checking' | 'installing' | 'enabling' | 'finished'; currentPackage?: string;
  items: (InstallItem & { state: 'pending' | 'installed' | 'enabled' | 'reused'; application?: ChangeResult['application'] })[];
  restartRequired: boolean; backupPath?: string; error?: string; warnings: string[];
}
interface Options extends MainEnvironment {
  root: string; installAnchor?: string;
  scan?: () => Promise<PluginRecord[]>;
  inspect?: typeof inspectCandidate;
}
interface Snapshot { records: PluginRecord[]; revision: string; files: Record<string, string | undefined> }
interface Receipt { preview: InstallPreview; plan: ComposePlan; revision: string }

/** The current profile's official manager owns package changes, reloads and install cancellation. */
export class HostInstaller {
  private receipts = new Map<string, Receipt>();
  private active = new Set<string>();
  constructor(private manager: Manager, readonly options: Options) {}
  target(): MainEnvironment {
    const { profile, directory, runtimeVersion } = this.options;
    return { profile, directory, runtimeVersion };
  }
  getPreview(id: string, owner: string | undefined): InstallPreview {
    const receipt = this.receipts.get(id);
    if (!receipt || receipt.plan.owner !== owner) throw new Error('安装预览已失效或属于其他会话，请重新检查。');
    return structuredClone(receipt.preview);
  }
  isActive(record: InstallEvidence): boolean {
    if (record.processId === process.pid) return this.active.has(record.id);
    if (!Number.isSafeInteger(record.processId) || record.processId <= 0) return false;
    try { process.kill(record.processId, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
  }
  private async snapshot(): Promise<Snapshot> {
    const files = Object.fromEntries(await Promise.all(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml']
      .map(async name => [name, await optionalText(join(this.options.directory, name))])));
    const records = await (this.options.scan?.() ?? scanProfile(this.options.directory, this.options.installAnchor));
    return { files, records, revision: digest(JSON.stringify({ files, records })) };
  }
  private candidates(plan: ComposePlan): Candidate[] {
    const { fingerprint, ...body } = plan;
    if (digest(JSON.stringify(body)) !== fingerprint) throw new Error('方案内容已变化，请重新生成。');
    if (plan.missing.length || plan.report.findings.some(x => x.severity === 'error')) throw new Error('方案缺少能力或存在兼容性错误，请先调整。');
    const candidates = plan.selected.filter(x => x.source === 'npm');
    if (new Set(candidates.map(x => x.name)).size !== candidates.length) throw new Error('方案包含重复的插件包。');
    for (const candidate of candidates) {
      packageName(candidate.name); version(candidate.version);
      if (isProtected(candidate.name)) throw new Error(`方案不能替换官方组件或管理插件：${candidate.name}`);
      if (!candidate.integrity || !candidate.metadataHash) throw new Error(`${candidate.name} 缺少制品信息，请重新生成方案。`);
    }
    return candidates;
  }
  private comparison(records: PluginRecord[], selected: PluginRecord[]): { findings: Finding[]; blockers: string[] } {
    const names = new Set(selected.map(x => x.name));
    const baseline = new Set(checkCompatibility(records, this.options.runtimeVersion).findings.filter(x => x.severity === 'error').map(x => JSON.stringify(x)));
    const combined = [...records.filter(x => !names.has(x.name)), ...selected.map(x => ({ ...x, enabled: true }))];
    const findings = checkCompatibility(combined, this.options.runtimeVersion).findings;
    return { findings, blockers: findings.filter(x => x.severity === 'error' &&
      (x.plugins.some(name => names.has(name)) || !baseline.has(JSON.stringify(x)))).map(x => x.message) };
  }
  async preview(plan: ComposePlan, signal?: AbortSignal): Promise<InstallPreview> {
    const candidates = this.candidates(plan);
    const current = await this.snapshot();
    for (const candidate of candidates) {
      const fresh = await (this.options.inspect ?? inspectCandidate)(candidate.name, candidate.version, candidate.capabilities, signal);
      if (fresh.integrity !== candidate.integrity || fresh.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} 的发布内容已变化，请重新生成方案。`);
    }
    signal?.throwIfAborted();
    const items: InstallItem[] = candidates.map(candidate => {
      const before = current.records.find(x => x.name === candidate.name);
      return { name: candidate.name, version: candidate.version, previousVersion: before?.version, permissions: candidate.permissions,
        action: !before ? 'install' : before.version !== candidate.version ? 'replace' : before.enabled ? 'reuse' : 'enable' };
    });
    const selected = candidates.map(candidate => {
      const before = current.records.find(x => x.name === candidate.name && x.version === candidate.version);
      return before ?? candidateRecord(candidate);
    });
    const comparison = this.comparison(current.records, selected);
    const preview = { id: randomUUID(), planId: plan.id, task: plan.task, target: this.target(), items, ...comparison,
      fingerprint: digest(JSON.stringify({ plan: plan.fingerprint, target: this.target(), revision: current.revision, items })) };
    this.receipts.set(preview.id, { preview, plan: structuredClone(plan), revision: current.revision });
    while (this.receipts.size > 30) this.receipts.delete(this.receipts.keys().next().value!);
    return structuredClone(preview);
  }
  async install(previewId: string, owner: string | undefined, options: {
    signal?: AbortSignal; onProgress?: (value: InstallEvidence) => void;
  } = {}): Promise<InstallEvidence> {
    const receipt = this.receipts.get(previewId);
    if (!receipt || receipt.plan.owner !== owner) throw new Error('安装预览已失效或属于其他会话，请重新检查。');
    if (receipt.preview.blockers.length) throw new Error(receipt.preview.blockers.join('\n'));
    return withLock(join(this.options.directory, '.autocompose-install.lock'), async () => {
      if (this.receipts.get(previewId) !== receipt) throw new Error('这个安装预览已经使用，请重新检查。');
      this.receipts.delete(previewId);
      options.signal?.throwIfAborted();
      let snapshot = await this.snapshot();
      if (snapshot.revision !== receipt.revision) throw new Error('主环境已发生变化，请重新检查安装内容。');
      const candidates = this.candidates(receipt.plan);
      const record: InstallEvidence = { id: randomUUID(), planId: receipt.plan.id, task: receipt.plan.task,
        target: this.target(), processId: process.pid, startedAt: new Date().toISOString(), status: 'running', stage: 'checking',
        items: receipt.preview.items.map(x => ({ ...x, state: x.action === 'reuse' ? 'reused' : 'pending' })), restartRequired: false, warnings: [] };
      const save = async () => {
        await writeJson(join(this.options.root, 'installations', `${record.id}.json`), record);
        try { options.onProgress?.(structuredClone(record)); } catch { /* UI observers do not control package writes. */ }
      };
      const ensureUnchanged = async () => {
        options.signal?.throwIfAborted();
        if ((await this.snapshot()).revision !== snapshot.revision) throw new Error('主环境被其他操作修改，后续安装已停止。请重新检查。');
      };
      const observe = (result: ChangeResult) => {
        record.restartRequired ||= result.application === 'restart-required';
        record.warnings.push(...(result.warnings ?? []));
        if (result.pendingBuilds?.length) throw new Error(`插件需要构建授权：${result.pendingBuilds.join('、')}。请在 DSH 插件管理中处理后重试。`);
        if (!['applied', 'restart-required'].includes(result.application) || (result.packageResult && result.packageResult.exitCode !== 0)) {
          throw new Error(result.error?.diagnostic ?? result.error?.code ?? `DSH 未完成操作：${result.application}`);
        }
      };
      this.active.add(record.id);
      try {
        await save();
        // Revalidate every selected artifact before the first mutation.
        for (const candidate of candidates) {
          const fresh = await (this.options.inspect ?? inspectCandidate)(candidate.name, candidate.version, candidate.capabilities, options.signal);
          if (fresh.integrity !== candidate.integrity || fresh.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} 的发布内容已变化，请重新生成方案。`);
        }
        await ensureUnchanged();
        if (record.items.some(x => x.action !== 'reuse')) {
          record.backupPath = join(this.options.root, 'install-backups', `${record.id}.json`);
          await writeJson(record.backupPath, { target: this.target(), at: record.startedAt, files: snapshot.files });
          await save();
        }
        for (const item of record.items.filter(x => ['install', 'replace'].includes(x.action))) {
          await ensureUnchanged();
          record.stage = 'installing'; record.currentPackage = item.name; await save();
          const requestId = randomUUID() as Parameters<Manager['cancelInstall']>[0];
          let cancelling: ReturnType<Manager['cancelInstall']> | undefined;
          const cancel = () => { cancelling ??= this.manager.cancelInstall(requestId); void cancelling.catch(() => {}); };
          // Calling the manager registers the request synchronously before it awaits pnpm.
          const installing = this.manager.installBundle(`${item.name}@${item.version}`, { enabled: false, requestId, registry: registryUrl });
          options.signal?.addEventListener('abort', cancel, { once: true });
          if (options.signal?.aborted) cancel();
          let result: ChangeResult;
          try { result = await installing; }
          finally { options.signal?.removeEventListener('abort', cancel); await cancelling; }
          item.application = result.application;
          snapshot = await this.snapshot();
          if (snapshot.records.some(x => x.name === item.name && x.version === item.version)) item.state = 'installed';
          await save(); observe(result);
        }
        await ensureUnchanged();
        const installed = candidates.map(candidate => {
          const actual = snapshot.records.find(x => x.name === candidate.name && x.version === candidate.version);
          if (!actual || digest(JSON.stringify(packageMetadata(actual.manifest))) !== candidate.metadataHash) throw new Error(`${candidate.name} 安装后的版本或声明与方案不符，已停止启用。`);
          return actual;
        });
        const checked = this.comparison(snapshot.records, installed);
        if (checked.blockers.length) throw new Error(`安装后检查未通过，已停止启用：${checked.blockers.join('；')}`);
        // Dependencies are enabled first; selected packages have all been staged and inspected.
        const ordered: InstallEvidence['items'] = [], visiting = new Set<string>(), visited = new Set<string>();
        const visit = (item: InstallEvidence['items'][number]) => {
          if (visited.has(item.name)) return;
          if (visiting.has(item.name)) throw new Error('插件之间存在循环依赖，已停止启用。');
          visiting.add(item.name);
          const candidate = candidates.find(x => x.name === item.name)!;
          for (const name of Object.keys(compatMetadata(candidate.manifest.dshCompat).requires ?? {})) {
            const dependency = record.items.find(x => x.name === name);
            if (dependency) visit(dependency);
          }
          visiting.delete(item.name); visited.add(item.name); ordered.push(item);
        };
        record.items.forEach(visit);
        for (const item of ordered.filter(x => x.action !== 'reuse')) {
          await ensureUnchanged(); record.stage = 'enabling'; record.currentPackage = item.name; await save();
          const result = await this.manager.setBundleEnabled(item.name, true);
          item.application = result.application;
          snapshot = await this.snapshot();
          if (snapshot.records.some(x => x.name === item.name && x.version === item.version && x.enabled)) item.state = 'enabled';
          await save(); observe(result);
          if (!snapshot.records.some(x => x.name === item.name && x.version === item.version && x.enabled)) throw new Error(`${item.name} 的启用状态未保存。`);
        }
        record.status = 'completed';
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        record.status = options.signal?.aborted ? 'cancelled' : record.items.some(x => ['installed', 'enabled'].includes(x.state)) ? 'partial' : 'failed';
      } finally {
        record.stage = 'finished'; delete record.currentPackage; record.finishedAt = new Date().toISOString();
        try { await save(); } finally { this.active.delete(record.id); }
      }
      return record;
    });
  }
}
