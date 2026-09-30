import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { RUNTIME_VERSION } from './catalog.ts';

/** Resolve from the host installation so a plugin never installs a second DSH. */
export function resolveRuntime(installAnchor: string | URL = import.meta.url): { bin: string; manifest: string } {
  const require = createRequire(installAnchor);
  let manifest: string;
  try { manifest = require.resolve('@deepseek-ai/dsh/package.json'); }
  catch { throw new Error(`未找到 DSH ${RUNTIME_VERSION}。请在 DSH 中运行；独立 CLI 可用 --install-anchor 指定现有 DSH 安装中的 package.json。`); }
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  if (pkg.name !== '@deepseek-ai/dsh' || pkg.version !== RUNTIME_VERSION) {
    throw new Error(`本版执行器需要 DSH ${RUNTIME_VERSION}，现有安装为 ${String(pkg.version)}。`);
  }
  const executable = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.dsh;
  if (typeof executable !== 'string') throw new Error('现有 DSH 安装未声明 CLI 入口。');
  const bin = resolve(dirname(manifest), executable);
  if (!existsSync(bin)) throw new Error('现有 DSH 安装缺少编译后的 CLI 入口。');
  return { bin, manifest };
}
