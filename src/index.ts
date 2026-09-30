import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot';
import type {} from '@deepseek-ai/dsh-plugin-manager';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { approve } from '../shared/approval.ts';
import { discover } from './catalog.ts';
import { loadPlan, savePlan } from './planner.ts';
import { planTask } from './planning.ts';
import { runPlan, savePreset } from './runner.ts';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { ComposeController } from './controller.ts';
import { HostInstaller } from './host-install.ts';

class AutocomposeUI extends TypertRemoteService {
  constructor(ctx: Context, private controller: ComposeController) { super(ctx, 'autocomposeUI'); }
  @Remote async request(payload: string): Promise<string> { return this.controller.request(payload); }
}

export const name = 'dsh-autocompose';
export const inject = ['tools', 'sandboxPolicy', 'profileContext', 'pluginManager'];
export interface Config { root?: string; catalog?: string; provider?: string; model?: string; envKeys?: string[]; timeoutMs?: number; autoDiscover?: boolean }

export function apply(ctx: Context, config: Config = {}): void {
  const root = resolve(config.root ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'autocompose'));
  const installAnchor = ctx.profileContext.installAnchor;
  const installer = new HostInstaller(ctx.pluginManager, { root, installAnchor, profile: ctx.profileContext.name,
    directory: ctx.profileContext.dir, runtimeVersion: getDshRuntimeVersion() });
  const controller = new ComposeController({ ...config, root, installAnchor, installer });
  new AutocomposeUI(ctx, controller);
  ctx.effect(() => () => controller.dispose(), 'autocompose: browser jobs');
  const disposal = new AbortController();
  const running = new Set<Promise<unknown>>();
  ctx.effect(() => async () => { disposal.abort(); await Promise.allSettled(running); }, 'autocompose: close owned runtimes');
  ctx.tools.register(defineTool({
    name: 'autocompose',
    description: '按任务选择兼容插件。先 plan 生成方案；run 在临时环境执行任务；install_preview 用 planId 检查将插件安装到当前主环境的变更，将返回的 id 作为 install 的 previewId，批准后持久安装并启用。安装不启动模型任务。主环境只指当前 profile。运行、安装与保存预设遵守 DSH 人工批准机制。',
    parameters: {
      action: { type: 'string', required: true, enum: ['plan', 'run', 'save_preset', 'discover', 'install_preview', 'install'] },
      task: { type: 'string', description: 'plan 的任务文本；discover 的英文能力名称。' },
      capabilities: { type: 'array', items: { type: 'string' }, description: '可选，覆盖规则推断的能力列表。' },
      planId: { type: 'string' }, preset: { type: 'string' },
      previewId: { type: 'string', description: 'install_preview 结果中的 id。' },
      mode: { type: 'string', enum: ['read-only', 'workspace-write'], description: 'run 的任务目录权限，默认 read-only。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const signal = AbortSignal.any([exec.signal, disposal.signal]);
      signal.throwIfAborted();
      if (args.action === 'discover') return JSON.stringify(await discover(args.task ?? '', signal));
      const owner = exec.agent?.session.id;
      if (args.action === 'install') {
        const preview = installer.getPreview(args.previewId ?? '', owner);
        if (preview.blockers.length) throw new Error(preview.blockers.join('\n'));
        await approve(ctx, exec, 'install composed plugins', `将插件安装并启用到 ${preview.target.profile}（${preview.target.directory}）：` +
          preview.items.map(x => `${x.name}: ${x.previousVersion ?? '未安装'} → ${x.version} (${x.action})`).join('；') +
          `。权限声明：${preview.items.flatMap(x => x.permissions).join('、')}。插件会保留，可能需要重启 DSH。`);
        const promise = installer.install(preview.id, owner, { signal });
        running.add(promise);
        try { return JSON.stringify(await promise); } finally { running.delete(promise); }
      }
      if (args.action === 'plan') {
        const plan = await planTask({ task: args.task ?? '', cwd: exec.agent?.session.header.cwd ?? process.cwd(), owner,
          catalog: config.catalog, capabilities: args.capabilities, autoDiscover: config.autoDiscover, signal });
        await savePlan(root, plan); return JSON.stringify(plan);
      }
      const plan = await loadPlan(root, args.planId ?? '');
      if (plan.owner !== owner) throw new Error('该计划属于另一个会话，请在当前会话重新规划');
      if (args.action === 'install_preview') return JSON.stringify(await installer.preview(plan, signal));
      await approve(ctx, exec, 'autocompose operation', `${args.action}: ${plan.selected.map(x => `${x.name}@${x.version}`).join(', ')}; 权限 ${plan.permissions.join(', ')}; mode=${args.mode ?? 'read-only'}; workspace=${plan.cwd}; plan=${plan.fingerprint}`);
      if (args.action === 'save_preset') return JSON.stringify({ path: await savePreset(root, args.preset ?? '', plan) });
      const promise = runPlan(plan, { root, installAnchor, provider: config.provider, model: config.model, envKeys: config.envKeys,
        timeoutMs: config.timeoutMs, signal, mode: args.mode });
      running.add(promise);
      try { return JSON.stringify(await promise); } finally { running.delete(promise); }
    },
  }));
}
