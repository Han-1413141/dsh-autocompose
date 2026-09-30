import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export async function stopTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    try { await exec('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); }
    catch (error) {
      try { process.kill(pid, 0); } catch { return; }
      throw error;
    }
  } else {
    try { process.kill(-pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}
export function childEnvironment(keys: string[] = [], parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const system = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT',
    'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'];
  const env: NodeJS.ProcessEnv = {};
  for (const key of [...system, ...keys]) {
    if (/^(NODE_OPTIONS|NODE_PATH|LD_|DYLD_|BASH_ENV|ENV$|DSH_)/.test(key)) throw new Error(`不允许转发运行时注入变量：${key}`);
    if (parent[key] !== undefined) env[key] = parent[key];
  }
  return { ...env, DSH_TELEMETRY_DISABLED: '1' };
}

export async function runProcess(command: string, args: string[], options: {
  cwd: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs?: number;
}): Promise<{ code: number; output: string }> {
  options.signal?.throwIfAborted();
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 180000)]) : AbortSignal.timeout(options.timeoutMs ?? 180000);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stop: Promise<void> | undefined;
    const collect = (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-128000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const abort = () => { if (child.pid) stop ??= stopTree(child.pid); stop?.catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.once('error', error => { signal.removeEventListener('abort', abort); reject(error); });
    child.once('close', async code => {
      signal.removeEventListener('abort', abort);
      try {
        await stop;
        signal.throwIfAborted();
        if (code !== 0) throw new Error(`进程退出码 ${code}: ${output}`);
        resolve({ code, output });
      } catch (error) { reject(error); }
    });
  });
}
