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
export interface Config { root?: string; catalog?: string; provider?: string; model?: string; envKeys?: string[]; timeoutMs?: number; autoDiscover?: boolean;
  windowMode?: 'auto' | 'desktop' | 'web'; desktopExecutable?: string }

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
    description: '用户需要新能力时调用 assemble：根据自然语言任务自动搜索 npm 的 DSH 插件、核验精确版本、检查兼容性，然后经 DSH 批准安装到当前主环境，无需用户手工寻找包名。destination=window 在 Desktop 中直接启动独立 DSH 客户端，支持持续对话；Web 宿主返回网页链接。reveal_environment 重新显示正在运行的窗口。只查看方案用 plan；后台一次性执行用 run。未知任务会搜索原文，未找到时返回缺项，不能声称已组装。独立环境通过 close_environment 关闭。',
    parameters: {
      action: { type: 'string', required: true, enum: ['assemble', 'plan', 'run', 'save_preset', 'discover', 'install_preview', 'install', 'close_environment', 'reveal_environment'] },
      task: { type: 'string', description: 'assemble / plan 的自然语言任务；discover 的中英文关键词。' },
      destination: { type: 'string', enum: ['main', 'window'], description: 'assemble 的目标，默认 main。window 打开独立的可持续对话环境。' },
      environmentId: { type: 'string', description: 'close_environment / reveal_environment 使用返回的独立环境 id。' },
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
      if (args.action === 'close_environment') return JSON.stringify(await controller.environments.close(args.environmentId ?? '', owner));
      if (args.action === 'reveal_environment') return JSON.stringify(await controller.environments.reveal(args.environmentId ?? '', owner));
      if (args.action === 'assemble') {
        const operation = (async () => {
          const plan = await planTask({ task: args.task ?? '', cwd: exec.agent?.session.header.cwd ?? process.cwd(), owner,
            catalog: config.catalog, capabilities: args.capabilities, autoDiscover: config.autoDiscover, signal });
          await savePlan(root, plan);
          if (plan.missing.length) return { plan, error: '尚未找到覆盖全部需求的兼容插件。请补充关键词或查看搜索记录。' };
          if (args.destination === 'window') {
            await approve(ctx, exec, 'open composed DSH environment', `在独立窗口安装 ${plan.selected.map(x => `${x.name}@${x.version}`).join('、')} 并执行任务；目录 ${plan.cwd}，权限 ${args.mode ?? 'read-only'}。窗口支持持续对话，关闭环境前持续运行。`);
            const environment = await controller.environments.open(plan, { signal, mode: args.mode ?? 'read-only', keep: true });
            return { plan, environment, ...(environment.windowMode === 'web' ? { url: controller.environments.url(environment.id, owner) } : {}) };
          }
          const preview = await installer.preview(plan, signal);
          if (preview.blockers.length) return { plan, preview, error: preview.blockers.join('；') };
          await approve(ctx, exec, 'install composed plugins', `自动安装并启用到 ${preview.target.profile}：` +
            preview.items.map(x => `${x.name}: ${x.previousVersion ?? '未安装'} → ${x.version} (${x.action})`).join('；') +
            '。第三方插件使用宿主权限；插件持续保留。');
          return { plan, install: await installer.install(preview.id, owner, { signal }) };
        })();
        running.add(operation);
        try { return JSON.stringify(await operation); } finally { running.delete(operation); }
      }
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
