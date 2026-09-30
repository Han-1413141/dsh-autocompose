import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { readJson } from '../shared/files.ts';
import { parseRequest } from '../shared/rpc.ts';
import { RUNTIME_VERSION } from './catalog.ts';
import { loadPlan, savePlan, type ComposePlan } from './planner.ts';
import { planTask } from './planning.ts';
import { loadPreset, runIsActive, runPlan, savePreset, type RunEvidence, type RunOptions } from './runner.ts';

const key = z.string().uuid();
const presetName = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const requests = z.discriminatedUnion('action', [
  z.object({ action: z.literal('overview') }).strict(),
  z.object({ action: z.literal('plan'), task: z.string().trim().min(1).max(30000), cwd: z.string().min(1).max(4096),
    capabilities: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,40}$/)).max(20).optional() }).strict(),
  z.object({ action: z.literal('start'), planId: key, fingerprint: z.string().length(64),
    mode: z.enum(['read-only', 'workspace-write']), keep: z.boolean() }).strict(),
  z.object({ action: z.literal('cancel'), jobId: key }).strict(),
  z.object({ action: z.literal('savePreset'), planId: key, name: presetName }).strict(),
  z.object({ action: z.literal('loadPreset'), name: presetName }).strict(),
  z.object({ action: z.literal('getPlan'), planId: key }).strict(),
]);
export interface ComposeJob {
  id: string; kind: 'plan' | 'run'; status: 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  startedAt: string; plan?: ComposePlan; run?: RunEvidence; error?: string;
}
export interface ComposeOverview {
  cwd: string; runtimeVersion: string; jobs: ComposeJob[]; history: RunEvidence[];
  presets: { name: string; task: string }[]; plans: ComposePlan[];
  notices: string[];
}
interface Options extends Omit<RunOptions, 'signal' | 'onProgress'> { catalog?: string; autoDiscover?: boolean }

async function recent<T>(directory: string, count: number, notices: string[]): Promise<T[]> {
  let names: string[];
  try { names = (await readdir(directory)).filter(x => x.endsWith('.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const files = await Promise.all(names.map(async name => ({ name, time: (await stat(join(directory, name))).mtimeMs })));
  const values = await Promise.allSettled(files.sort((a, b) => b.time - a.time).slice(0, count).map(x => readJson<T>(join(directory, x.name))));
  const result: T[] = [];
  for (const value of values) {
    if (value.status === 'fulfilled') result.push(value.value);
    else notices.push('有一条本地记录无法读取，其余记录仍可使用。');
  }
  return result;
}

/** Host-owned jobs survive page navigation and never run inside a browser request lifetime. */
export class ComposeController {
  private jobs = new Map<string, { view: ComposeJob; abort: AbortController; promise: Promise<void> }>();
  private disposed = false;
  constructor(readonly options: Options) {}
  private launch(kind: ComposeJob['kind'], work: (signal: AbortSignal, view: ComposeJob) => Promise<void>): ComposeJob {
    if (this.disposed) throw new Error('插件正在关闭');
    if ([...this.jobs.values()].some(x => ['running', 'cancelling'].includes(x.view.status))) throw new Error('已有任务正在处理，请等待完成或取消');
    const abort = new AbortController();
    const view: ComposeJob = { id: randomUUID(), kind, status: 'running', startedAt: new Date().toISOString() };
    const promise = Promise.resolve().then(() => work(abort.signal, view)).then(() => {
      view.status = abort.signal.aborted || view.run?.status === 'cancelled' ? 'cancelled' : view.run?.status === 'failed' ? 'failed' : 'completed';
    }).catch(error => { view.status = abort.signal.aborted ? 'cancelled' : 'failed'; view.error = String(error); });
    this.jobs.set(view.id, { view, abort, promise });
    while (this.jobs.size > 12) this.jobs.delete(this.jobs.keys().next().value!);
    return structuredClone(view);
  }
  private async ownedPlan(id: string): Promise<ComposePlan> {
    const plan = await loadPlan(this.options.root, id);
    if (plan.owner !== 'web-ui') throw new Error('请在自组装页面重新生成此计划');
    return plan;
  }
  async overview(): Promise<ComposeOverview> {
    const notices: string[] = [];
    const [history, presets, plans] = await Promise.all([
      recent<RunEvidence>(join(this.options.root, 'history'), 30, notices),
      recent<{ name: string; plan: ComposePlan }>(join(this.options.root, 'presets'), 30, notices),
      recent<ComposePlan>(join(this.options.root, 'plans'), 20, notices),
    ]);
    const active = new Set([...this.jobs.values()].map(x => x.view.run?.id));
    return { cwd: process.cwd(), runtimeVersion: RUNTIME_VERSION,
      jobs: [...this.jobs.values()].map(x => structuredClone(x.view)).reverse(),
      history: history.map(x => x.status === 'running' && !active.has(x.id) && !runIsActive(x) ? { ...x, status: 'interrupted', error: '上次运行进程已结束，未保存最终结果。请检查详情中的临时目录。' } : x),
      presets: presets.filter(x => x.plan?.owner === 'web-ui').map(x => ({ name: x.name, task: x.plan.task })),
      plans: plans.filter(x => x.owner === 'web-ui'), notices: [...new Set(notices)] };
  }
  async request(payload: string): Promise<string> {
    const args = parseRequest(requests, payload);
    if (this.disposed) throw new Error('插件正在关闭');
    if (args.action === 'overview') return JSON.stringify(await this.overview());
    if (args.action === 'plan') {
      const cwd = resolve(args.cwd);
      if (!(await stat(cwd)).isDirectory()) throw new Error('请选择存在的工作目录');
      return JSON.stringify(this.launch('plan', async (signal, job) => {
        const plan = await planTask({ task: args.task, cwd, capabilities: args.capabilities, owner: 'web-ui',
          catalog: this.options.catalog, autoDiscover: this.options.autoDiscover, signal });
        signal.throwIfAborted(); await savePlan(this.options.root, plan); job.plan = plan;
      }));
    }
    if (args.action === 'start') {
      const plan = await this.ownedPlan(args.planId);
      if (plan.fingerprint !== args.fingerprint) throw new Error('方案已变化，请重新查看后运行');
      return JSON.stringify(this.launch('run', async (signal, job) => {
        job.plan = plan;
        job.run = await runPlan(plan, { ...this.options, signal, mode: args.mode, keep: args.keep,
          onProgress: value => { job.run = value; } });
      }));
    }
    if (args.action === 'cancel') {
      const job = this.jobs.get(args.jobId);
      if (!job) throw new Error('任务不存在');
      if (job.view.status === 'running') { job.view.status = 'cancelling'; job.abort.abort(); }
      return JSON.stringify(job.view);
    }
    if (args.action === 'getPlan') return JSON.stringify(await this.ownedPlan(args.planId));
    if (args.action === 'savePreset') {
      await savePreset(this.options.root, args.name, await this.ownedPlan(args.planId));
      return JSON.stringify({ saved: true });
    }
    const plan = await loadPreset(this.options.root, args.name);
    if (plan.owner !== 'web-ui') throw new Error('该预设来自其他会话');
    await savePlan(this.options.root, plan);
    return JSON.stringify(plan);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const job of this.jobs.values()) job.abort.abort();
    await Promise.allSettled([...this.jobs.values()].map(x => x.promise));
  }
}
