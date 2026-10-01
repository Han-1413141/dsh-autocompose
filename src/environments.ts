import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { stringify } from 'yaml';
import { atomicWrite, digest, readJson, removeOwnedRun, writeJson } from '../shared/files.ts';
import { childEnvironment, runProcess, stopTree } from '../shared/process.ts';
import { scanProfile } from '../shared/profile.ts';
import { checkCompatibility } from '../shared/compatibility.ts';
import { inspectCandidate, RUNTIME_VERSION } from './catalog.ts';
import { resolveRuntime } from './runtime.ts';
import type { ComposePlan } from './planner.ts';
import type { RunOptions } from './runner.ts';

export interface EnvironmentRecord {
  id: string; planId: string; owner?: string; task: string; cwd: string; directory: string; startedAt: string; finishedAt?: string;
  status: 'starting' | 'ready' | 'closing' | 'closed' | 'failed' | 'interrupted';
  stage: string; currentPackage?: string; sessionId?: string; error?: string; warning?: string;
  cleanup: 'pending' | 'kept' | 'removed' | 'failed'; keep: boolean;
  packages: { name: string; version: string }[];
}
interface Owned { record: EnvironmentRecord; child?: ChildProcess; exited?: Promise<void>; url?: string; stopping?: Promise<void> }
export class WebEnvironments {
  private owned = new Map<string, Owned>();
  constructor(readonly options: Omit<RunOptions, 'signal' | 'onProgress'>) {}
  active(id: string): boolean { return this.owned.has(id); }
  url(id: string, owner?: string): string {
    const item = this.owned.get(id);
    if (!item || item.record.owner !== owner || item.record.status !== 'ready' || !item.url) throw new Error('环境已经关闭，请从方案重新打开。');
    return item.url;
  }
  private async save(item: Owned): Promise<void> { await writeJson(join(this.options.root, 'environments', `${item.record.id}.json`), item.record); }
  async open(plan: ComposePlan, options: { mode: 'read-only' | 'workspace-write'; keep: boolean; signal: AbortSignal;
    onProgress?: (record: EnvironmentRecord) => void }): Promise<EnvironmentRecord> {
    const { fingerprint, ...body } = plan;
    if (digest(JSON.stringify(body)) !== fingerprint || plan.runtimeVersion !== RUNTIME_VERSION) throw new Error('方案已变化，请重新生成。');
    if (plan.missing.length || plan.report.findings.some(x => x.severity === 'error')) throw new Error('方案缺少能力或存在兼容性错误。');
    if (!(await stat(plan.cwd)).isDirectory()) throw new Error('工作目录不存在。');
    if (this.owned.size >= 3) throw new Error('最多同时打开三个独立环境，请先关闭一个。');
    const id = randomUUID(), directory = join(this.options.root, 'runs', id), home = join(directory, 'home');
    const record: EnvironmentRecord = { id, planId: plan.id, owner: plan.owner, task: plan.task, cwd: plan.cwd, directory,
      startedAt: new Date().toISOString(), status: 'starting', stage: '准备独立环境', cleanup: 'pending', keep: options.keep,
      packages: plan.selected.map(x => ({ name: x.name, version: x.version })) };
    const item: Owned = { record }; this.owned.set(id, item);
    const progress = async (stage: string, currentPackage?: string) => {
      record.stage = stage; record.currentPackage = currentPackage; await this.save(item);
      try { options.onProgress?.(structuredClone(record)); } catch { /* Observers do not control the runtime. */ }
    };
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(this.options.timeoutMs ?? 600000)]);
    try {
      signal.throwIfAborted();
      await mkdir(home, { recursive: true });
      await writeJson(join(directory, '.autocompose-owner.json'), { id, pid: process.pid });
      await progress('准备独立环境');
      const runtime = resolveRuntime(this.options.installAnchor);
      const env = { ...childEnvironment(this.options.envKeys ?? ['DEEPSEEK_API_KEY']), DSH_HOME: home,
        ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
      await runProcess(process.execPath, [runtime.bin, '--profile', 'web', '--dump-config'], { cwd: directory, env, signal });
      for (const candidate of plan.selected.filter(x => x.source === 'npm')) {
        await progress('安装所选插件', candidate.name);
        const fresh = await inspectCandidate(candidate.name, candidate.version, candidate.capabilities, signal);
        if (fresh.integrity !== candidate.integrity || fresh.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} 发布内容已变化，请重新生成方案。`);
        await runProcess(process.execPath, [runtime.bin, 'plugin', '--profile', 'web', 'add', `${candidate.name}@${candidate.version}`,
          '--save-exact', '--ignore-scripts', '--registry=https://registry.npmjs.org'], { cwd: directory, env, signal });
      }
      await progress('检查实际安装的插件');
      const report = checkCompatibility(await scanProfile(join(home, 'profiles', 'web'), runtime.manifest), RUNTIME_VERSION);
      const failures = report.findings.filter(x => x.severity === 'error');
      if (failures.length) throw new Error(failures.map(x => x.message).join('；'));
      const patch = join(directory, 'window.patch.yml'), readyFile = join(directory, 'ready.json');
      // Keep the bootstrap outside this package so DSH does not also load AutoCompose's client in the child.
      const entry = join(directory, 'bootstrap.mjs');
      await copyFile(fileURLToPath(new URL('./environment-entry.js', import.meta.url)), entry);
      await atomicWrite(patch, stringify([
        { id: 'sandbox-policy', config: { mode: options.mode, workspaceRoot: plan.cwd } },
        { id: 'agent-default-model', config: { provider: this.options.provider ?? 'deepseek-official', model: this.options.model ?? 'deepseek-v4-flash' } },
        { id: 'tool-plugin-manager', disabled: true },
        { insert: [{ id: 'autocompose-window', name: entry,
          config: { cwd: plan.cwd, task: plan.task, readyFile } }] },
      ]));
      await progress('启动 DSH 窗口');
      const child = spawn(process.execPath, [runtime.bin, '--profile', 'web', '--patch', patch, '--no-open', '--host', '127.0.0.1', '--port', '0'],
        { cwd: plan.cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      item.child = child;
      let output = '', failure: Error | undefined, exited = false;
      const collect = (data: Buffer) => {
        output = (output + data.toString('utf8')).slice(-16000);
        const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/[^\s]*)/.exec(output);
        if (match) {
          const url = new URL(match[1]);
          if (url.hostname === '127.0.0.1' && url.searchParams.has('token')) item.url = url.href;
        }
      };
      child.stdout!.on('data', collect); child.stderr!.on('data', collect);
      child.once('error', error => { failure = error; });
      item.exited = new Promise(done => child.once('close', () => { exited = true; done(); }));
      void item.exited.then(async () => {
        if (record.status !== 'ready') return;
        record.status = 'failed'; record.error = '独立 DSH 进程已退出，可从方案重新打开。';
        try { await this.close(id, record.owner); } catch { /* close records cleanup failure. */ }
      });
      const deadline = Date.now() + 90000;
      while (true) {
        signal.throwIfAborted();
        if (failure) throw failure;
        if (exited) throw new Error(`独立 DSH 启动失败：${output.replace(/token=[^\s&]+/g, 'token=<redacted>')}`);
        if (Date.now() > deadline) throw new Error('独立 DSH 启动超时。');
        if (item.url) {
          try {
            const ready = await readJson<{ sessionId?: string; warning?: string }>(readyFile);
            Object.assign(record, ready); break;
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
        await delay(150, undefined, { signal });
      }
      record.status = 'ready'; await progress('窗口已就绪，可持续对话');
      return structuredClone(record);
    } catch (error) {
      record.status = 'failed'; record.error = options.signal.aborted ? '启动已取消' : String(error);
      await this.close(id, plan.owner);
      throw error;
    }
  }
  async close(id: string, owner?: string): Promise<EnvironmentRecord> {
    const item = this.owned.get(id);
    if (!item || item.record.owner !== owner) throw new Error('环境不存在或属于其他会话。');
    item.stopping ??= (async () => {
      const record = item.record, failed = record.status === 'failed';
      if (!failed) record.status = 'closing';
      try {
        // A failed checkpoint must never prevent stopping an owned process.
        await this.save(item).catch(() => {});
        if (item.child?.pid && item.child.exitCode === null && item.child.signalCode === null) await stopTree(item.child.pid);
        await item.exited;
        if (record.keep || failed) record.cleanup = 'kept';
        else { await removeOwnedRun(join(this.options.root, 'runs'), record.directory, id); record.cleanup = 'removed'; }
        record.status = failed ? 'failed' : 'closed';
      } catch (error) { record.status = 'failed'; record.cleanup = 'failed'; record.error = `${record.error ?? ''}\n关闭环境失败：${String(error)}`; }
      finally {
        record.finishedAt = new Date().toISOString(); record.stage = record.status === 'closed' ? '环境已关闭' : '环境已停止';
        item.url = undefined;
        if (!item.child || item.child.exitCode !== null || item.child.signalCode !== null) this.owned.delete(id);
        await this.save(item);
      }
    })();
    await item.stopping;
    return structuredClone(item.record);
  }
  async dispose(): Promise<void> {
    await Promise.allSettled([...this.owned.values()].map(x => { x.record.keep = true; return this.close(x.record.id, x.record.owner); }));
  }
}
