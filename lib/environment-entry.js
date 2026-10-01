// src/environment-entry.ts
import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
var inject = ["sessionController"];
function apply(ctx, config) {
  const ready = async (value) => {
    await writeFile(`${config.readyFile}.tmp`, JSON.stringify(value), { encoding: "utf8", mode: 384 });
    await rename(`${config.readyFile}.tmp`, config.readyFile);
  };
  const shutdown = () => {
    process.kill(process.pid, "SIGTERM");
  };
  if (process.connected) process.once("disconnect", shutdown);
  ctx.effect(() => () => process.removeListener("disconnect", shutdown));
  const operation = Promise.resolve().then(async () => {
    try {
      await ctx.get("loader")?.await();
      const { sessionId } = await ctx.sessionController.create({ cwd: config.cwd });
      await ctx.sessionController.rename({ sessionId, title: config.task.slice(0, 20) });
      await ctx.sessionController.prompt({
        sessionId,
        mode: "queue",
        content: [{ type: "text", text: config.task }],
        requestId: `autocompose-${randomUUID()}`
      }, new AbortController().signal);
      await ready({ sessionId });
    } catch (error) {
      await ready({ warning: `\u521D\u59CB\u4EFB\u52A1\u672A\u63D0\u4EA4\uFF0C\u53EF\u5728\u65B0\u7A97\u53E3\u914D\u7F6E\u6A21\u578B\u540E\u7EE7\u7EED\uFF1A${String(error)}` });
    }
  });
  ctx.effect(() => async () => {
    await operation;
  });
}
export {
  apply,
  inject
};
//# sourceMappingURL=environment-entry.js.map
