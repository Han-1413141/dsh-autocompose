import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { childEnvironment } from '../shared/process.ts';

export interface WindowOptions { windowMode?: 'auto' | 'desktop' | 'web'; desktopExecutable?: string }
export function windowMode(options: WindowOptions): 'desktop' | 'web' {
  if (options.windowMode && options.windowMode !== 'auto') return options.windowMode;
  return options.desktopExecutable || process.versions.electron ? 'desktop' : 'web';
}
/** Launch the installed DSH application. Never pass the Node-mode flag to its GUI process. */
export function desktopLaunch(options: WindowOptions, home: string, directory: string, envKeys?: string[]) {
  const executable = options.desktopExecutable ?? (process.versions.electron ? process.execPath : undefined);
  if (!executable || !isAbsolute(executable) || !existsSync(executable)) {
    throw new Error('未找到 DSH 桌面客户端。请在 DSH Desktop 中运行，或在插件配置中填写 desktopExecutable 的完整路径。');
  }
  const resources = process.platform === 'darwin' ? resolve(dirname(executable), '..', 'Resources') : join(dirname(executable), 'resources');
  if (!existsSync(join(resources, 'app.asar'))) throw new Error('desktopExecutable 必须指向已安装的官方 DSH 桌面客户端。');
  const cli = join(resources, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
  const env: NodeJS.ProcessEnv = { ...childEnvironment(envKeys ?? ['DEEPSEEK_API_KEY']), DSH_HOME: home };
  // A configured envKeys must not accidentally turn the desktop back into a Node process.
  for (const key of Object.keys(env)) if (/^ELECTRON_/i.test(key) || /^NODE_/i.test(key)) delete env[key];
  return { executable, args: [`--user-data-dir=${join(directory, 'desktop-data')}`], env, cli };
}
