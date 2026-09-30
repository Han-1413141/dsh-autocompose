import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
import type {} from '@deepseek-ai/dsh-sandbox-policy';

export async function approve(ctx: Context, exec: ToolExecution, subject: string, justification: string): Promise<void> {
  const policy = ctx.sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {});
  await approveEscalation({ requestedMode: 'danger-full-access', effectiveMode: policy.mode, subject, justification },
    { approver: ctx.get('approval'), agent: exec.agent, callId: exec.callId, toolName: exec.name, signal: exec.signal });
  exec.signal.throwIfAborted();
}
