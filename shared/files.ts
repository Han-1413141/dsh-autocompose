import { open, readFile, mkdir, rename, rm, realpath, lstat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }
export async function optionalText(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
export async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(content, 'utf8'); await file.sync(); await file.close();
    // Windows readers and scanners can briefly deny replacement of an open file.
    // Retry only that transient condition, retaining the same complete temporary file.
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) {
        if (process.platform !== 'win32' || attempt >= 6 ||
          !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await new Promise(done => setTimeout(done, 20 * 2 ** attempt));
      }
    }
  } catch (error) { await file.close().catch(() => {}); await rm(temporary, { force: true }); throw error; }
}
export const writeJson = (path: string, value: unknown) => atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
export function within(root: string, target: string): string {
  const absolute = resolve(target), rel = relative(resolve(root), absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`路径超出指定目录：${target}`);
  return absolute;
}
export async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  // Use the same protocol as plugin_manager, including stale-PID recovery.
  return withFileLock(path.endsWith('.lock') ? path.slice(0, -5) : path, fn, { waitMs: 1000 });
}
/** Only delete an owned run after canonical-path and marker validation. */
export async function removeOwnedRun(root: string, directory: string, id: string): Promise<void> {
  const actualRoot = await realpath(root), actual = await realpath(directory);
  within(actualRoot, actual);
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('拒绝清理符号链接');
  const marker = await readJson<{ id: string }>(resolve(actual, '.autocompose-owner.json'));
  if (marker.id !== id) throw new Error('临时运行目录标记不匹配');
  await rm(actual, { recursive: true });
}
