#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { discover } from './catalog.ts';
import { loadPlan, savePlan } from './planner.ts';
import { planTask } from './planning.ts';
import { loadPreset, runPlan, savePreset } from './runner.ts';

const help = `dsh-autocompose ${createRequire(import.meta.url)('../package.json').version}
  plan --task "读取 PDF 并检索文档" [--catalog catalog.json] [--capabilities pdf,web]
  discover --capability pdf
  run --id <planId> --yes [--mode read-only|workspace-write]
  save-preset --id <planId> --preset <name>
  use-preset --preset <name> [--task "新任务"] --yes

通用：--root <状态目录> --cwd <任务目录> --no-discovery（不补充搜索）
运行：--provider <route> --model <id> --timeout <毫秒> --keep
默认只读；独立配置目录不是操作系统沙箱。首次运行需已有 pnpm 和模型凭据。
只有 run/use-preset 会启动模型，--yes 表示确认计划中的安装、进程、网络与目录权限。`;
async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: {
    task: { type: 'string' }, catalog: { type: 'string' }, capabilities: { type: 'string' }, capability: { type: 'string' },
    root: { type: 'string' }, cwd: { type: 'string' }, id: { type: 'string' }, preset: { type: 'string' },
    provider: { type: 'string' }, model: { type: 'string' }, timeout: { type: 'string' },
    mode: { type: 'string' }, yes: { type: 'boolean' }, keep: { type: 'boolean' }, 'no-discovery': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  const command = positionals[0];
  if (!command || args.help) { console.log(help); return; }
  const root = resolve(args.root ?? '.dsh-autocompose');
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('用户取消'));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    let output: unknown;
    if (command === 'discover') output = await discover(args.capability ?? '', controller.signal);
    else if (command === 'plan') {
      const plan = await planTask({ task: args.task ?? '', cwd: resolve(args.cwd ?? process.cwd()), catalog: args.catalog,
        signal: controller.signal, autoDiscover: !args['no-discovery'], capabilities: args.capabilities?.split(',').map(x => x.trim()).filter(Boolean) });
      await savePlan(root, plan); output = plan;
    } else if (command === 'save-preset') output = { path: await savePreset(root, args.preset ?? '', await loadPlan(root, args.id ?? '')) };
    else if (command === 'run' || command === 'use-preset') {
      if (!args.yes) throw new Error('请先查看计划，再加 --yes 执行');
      if (args.mode && !['read-only', 'workspace-write'].includes(args.mode)) throw new Error('mode 必须是 read-only 或 workspace-write');
      const plan = command === 'run' ? await loadPlan(root, args.id ?? '') : await loadPreset(root, args.preset ?? '', args.task);
      const result = await runPlan(plan, { root, provider: args.provider, model: args.model, timeoutMs: args.timeout ? Number(args.timeout) : undefined,
        keep: args.keep, mode: args.mode as 'read-only' | 'workspace-write' | undefined, signal: controller.signal });
      output = result;
      if (result.status !== 'completed' || result.cleanup === 'failed') process.exitCode = 1;
    } else throw new Error(`未知命令：${command}`);
    console.log(JSON.stringify(output, null, 2));
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
