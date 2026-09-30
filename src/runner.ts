import { randomUUID } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { atomicWrite, digest, readJson, removeOwnedRun, withLock, writeJson } from '../shared/files.ts';
import { childEnvironment, runProcess } from '../shared/process.ts';
import { scanProfile } from '../shared/profile.ts';
import { checkCompatibility } from '../shared/compatibility.ts';
import type { ComposePlan } from './planner.ts';
import { createPlan } from './planner.ts';
import { inspectCandidate, RUNTIME_VERSION } from './catalog.ts';

const require = createRequire(import.meta.url);
const activeRuns = new Set<string>();
export const defaultDshBin = () => require.resolve('@deepseek-ai/dsh/lib/bin.js');
export interface RunOptions {
  root: string;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  envKeys?: string[];
  mode?: 'read-only' | 'workspace-write';
  signal?: AbortSignal;
  keep?: boolean;
  onProgress?: (evidence: RunEvidence) => void;
}
export interface RunEvidence {
  id: string; planId: string; fingerprint: string; startedAt: string; finishedAt?: string;
  processId?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'; runtimeVersion: string;
  stage?: 'preparing' | 'installing' | 'checking' | 'executing' | 'cleaning' | 'finished';
  currentPackage?: string;
  task?: string;
  mode?: 'read-only' | 'workspace-write';
  packages: { name: string; version: string }[];
  sessionId?: string; finalResponse?: string; events?: number; error?: string;
  cleanup: 'pending' | 'removed' | 'kept' | 'failed'; directory: string;
}

export function runIsActive(evidence: RunEvidence): boolean {
  if (evidence.processId === process.pid) return activeRuns.has(evidence.id);
  if (!Number.isSafeInteger(evidence.processId) || evidence.processId! <= 0) return false;
  try { process.kill(evidence.processId!, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export async function runPlan(plan: ComposePlan, options: RunOptions): Promise<RunEvidence> {
  const { fingerprint, ...body } = plan;
  if (digest(JSON.stringify(body)) !== fingerprint) throw new Error('计划内容已改变，请重新生成');
  const timeoutMs = options.timeoutMs ?? 600000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 7200000) throw new Error('timeoutMs 必须介于 1000 和 7200000');
  if (plan.missing.length) throw new Error(`缺少能力：${plan.missing.join('、')}。请添加候选插件或调整能力列表。`);
  if (plan.report.findings.some(x => x.severity === 'error')) throw new Error('组合存在兼容性错误');
  if (plan.runtimeVersion !== RUNTIME_VERSION) throw new Error(`本版执行器使用 DSH ${RUNTIME_VERSION}，请据此重新规划`);
  if (!(await stat(plan.cwd)).isDirectory()) throw new Error('任务工作目录不存在');
  const root = resolve(options.root), runs = join(root, 'runs');
  await mkdir(runs, { recursive: true });
  return withLock(join(root, `run-${plan.id}.lock`), async () => {
    options.signal?.throwIfAborted();
    const id = randomUUID(), directory = join(runs, id), home = join(directory, 'home');
    await mkdir(home, { recursive: true });
    await writeJson(join(directory, '.autocompose-owner.json'), { id, pid: process.pid });
    const evidence: RunEvidence = { id, planId: plan.id, fingerprint: plan.fingerprint, startedAt: new Date().toISOString(), processId: process.pid,
      status: 'running', runtimeVersion: RUNTIME_VERSION, packages: plan.selected.map(x => ({ name: x.name, version: x.version })),
      cleanup: 'pending', directory };
    evidence.task = plan.task; evidence.mode = options.mode ?? 'read-only';
    const evidencePath = join(root, 'history', `${id}.json`);
    const progress = async (stage: RunEvidence['stage'], currentPackage?: string) => {
      evidence.stage = stage;
      if (currentPackage) evidence.currentPackage = currentPackage; else delete evidence.currentPackage;
      await writeJson(evidencePath, evidence);
      try { options.onProgress?.(structuredClone(evidence)); } catch { /* Observers do not control execution. */ }
    };
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let harness: DeepSeekHarness | undefined;
    let closeFailed = false;
    activeRuns.add(id);
    try {
      await progress('preparing');
      const env = { ...childEnvironment(options.envKeys ?? ['DEEPSEEK_API_KEY']), DSH_HOME: home };
      // The official CLI creates its own SDK profile and applies package resolution rules.
      await runProcess(process.execPath, [defaultDshBin(), '--profile', 'sdk', '--dump-config'], { cwd: directory, env, signal });
      for (const candidate of plan.selected.filter(x => x.source === 'npm')) {
        await progress('installing', candidate.name);
        const current = await inspectCandidate(candidate.name, candidate.version, candidate.capabilities, signal);
        if (current.integrity !== candidate.integrity || current.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} 的元数据或制品已改变，请重新规划`);
        await runProcess(process.execPath, [defaultDshBin(), 'plugin', '--profile', 'sdk', 'add',
          `${candidate.name}@${candidate.version}`, '--save-exact', '--ignore-scripts', '--registry=https://registry.npmjs.org'], { cwd: directory, env, signal });
      }
      await progress('checking');
      const installed = await scanProfile(join(home, 'profiles', 'sdk'), require.resolve('@deepseek-ai/dsh/package.json'));
      const report = checkCompatibility(installed, RUNTIME_VERSION);
      const failures = report.findings.filter(x => x.severity === 'error');
      if (failures.length) throw new Error(`实际安装后检查失败：${failures.map(x => x.message).join('; ')}`);
      const patch = join(directory, 'execution.patch.yml');
      await atomicWrite(patch, stringify([
        { id: 'sandbox-policy', config: { mode: options.mode ?? 'read-only', workspaceRoot: plan.cwd } },
        { id: 'tool-plugin-manager', disabled: true },
      ]));
      harness = new DeepSeekHarness({ dshBin: defaultDshBin(), profile: 'sdk', dshHome: home,
        cwd: plan.cwd, processCwd: directory, env, patches: [patch],
        provider: options.provider ?? 'deepseek-official', model: options.model ?? 'deepseek-v4-flash',
        initializeTimeoutMs: 30000, requestTimeoutMs: timeoutMs });
      const runningHarness = harness;
      let abortClose: Promise<void> | undefined;
      const abort = () => { abortClose ??= runningHarness.close(); abortClose.catch(() => {}); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        await progress('executing');
        const result = await harness.run(plan.task);
        signal.throwIfAborted();
        if (!result.finalResponse.trim()) throw new Error('子运行时结束但未给出最终回复，请检查模型凭据与事件记录');
        Object.assign(evidence, { status: 'completed', sessionId: result.sessionId, finalResponse: result.finalResponse, events: result.events.length });
      } finally {
        signal.removeEventListener('abort', abort);
        if (abortClose) await abortClose;
      }
    } catch (error) {
      evidence.status = options.signal?.aborted ? 'cancelled' : 'failed';
      evidence.error = options.signal?.aborted ? '任务已取消' : error instanceof Error ? error.message : String(error);
    }
    finally {
      // Cleanup still runs when a progress checkpoint cannot be written (for example a full disk).
      try { await progress('cleaning'); } catch { /* The final checkpoint below reports persistence failure. */ }
      if (harness) {
        try { await harness.close(); }
        catch (error) { closeFailed = true; evidence.status = 'failed'; evidence.error = `${evidence.error ?? ''}\n关闭子运行时失败：${String(error)}`; }
      }
      evidence.finishedAt = new Date().toISOString();
      if (options.keep || closeFailed) evidence.cleanup = 'kept';
      else {
        try { await removeOwnedRun(runs, directory, id); evidence.cleanup = 'removed'; }
        catch (error) { evidence.cleanup = 'failed'; evidence.error = `${evidence.error ?? ''}\n清理失败：${String(error)}`; }
      }
      try { await progress('finished'); } finally { activeRuns.delete(id); }
    }
    return evidence;
  });
}

export async function savePreset(root: string, name: string, plan: ComposePlan): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name)) throw new Error('预设名称只允许字母、数字、短横线和下划线');
  const path = join(root, 'presets', `${name}.json`);
  await writeJson(path, { schemaVersion: 1, name, savedAt: new Date().toISOString(), plan });
  return path;
}

export async function loadPreset(root: string, name: string, task?: string): Promise<ComposePlan> {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name)) throw new Error('预设名称无效');
  const saved = await readJson<{ plan: ComposePlan }>(join(root, 'presets', `${name}.json`));
  const { fingerprint: previous, ...old } = saved.plan;
  if (digest(JSON.stringify(old)) !== previous) throw new Error('预设内容已变化');
  // A new task can require different capabilities; never reuse a stale coverage claim.
  return createPlan({ task: task ?? old.task, cwd: old.cwd, runtimeVersion: RUNTIME_VERSION,
    catalog: old.selected, owner: old.owner, ...(task === undefined ? { capabilities: old.capabilities } : {}) });
}
