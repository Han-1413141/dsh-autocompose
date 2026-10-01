/** Loaded only inside an owned Web profile. Seeds a normal, durable DSH chat. */
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-session-controller';
import type {} from '@deepseek-ai/dsh-app-boot';
import { rename, writeFile } from 'node:fs/promises';

export const inject = ['sessionController'];
export function apply(ctx: Context, config: { cwd: string; task: string; readyFile: string }): void {
  const ready = async (value: object) => {
    await writeFile(`${config.readyFile}.tmp`, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    await rename(`${config.readyFile}.tmp`, config.readyFile);
  };
  const shutdown = () => { process.kill(process.pid, 'SIGTERM'); };
  if (process.connected) process.once('disconnect', shutdown);
  ctx.effect(() => () => process.removeListener('disconnect', shutdown));
  const operation = Promise.resolve().then(async () => {
    try {
      await ctx.get('loader')?.await();
      const { sessionId } = await ctx.sessionController.create({ cwd: config.cwd });
      await ctx.sessionController.rename({ sessionId, title: config.task.slice(0, 20) });
      await ctx.sessionController.prompt({ sessionId, mode: 'queue', content: [{ type: 'text', text: config.task }],
        requestId: `autocompose-${randomUUID()}` as Parameters<typeof ctx.sessionController.prompt>[0]['requestId'] }, new AbortController().signal);
      await ready({ sessionId });
    } catch (error) {
      await ready({ warning: `初始任务未提交，可在新窗口配置模型后继续：${String(error)}` });
    }
  });
  ctx.effect(() => async () => { await operation; });
}
