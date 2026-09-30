import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { optionalText, within } from './files.ts';
import { isProtected, type PackageManifest, type PluginRecord } from './types.ts';
import { object, packageName } from './validation.ts';

export async function locateManifest(name: string, anchors: string[]): Promise<{ manifest: PackageManifest; directory: string }> {
  packageName(name);
  for (const anchor of anchors) {
    const require = createRequire(resolve(anchor));
    for (const searchPath of require.resolve.paths(name) ?? []) {
      const direct = join(searchPath, ...name.split('/'), 'package.json');
      const raw = await optionalText(direct);
      if (raw !== undefined) {
        const manifest = object(JSON.parse(raw), direct) as PackageManifest;
        if (manifest.name !== name) throw new Error(`包身份不一致：需要 ${name}，实际 ${manifest.name}`);
        return { manifest, directory: dirname(await realpath(direct)) };
      }
    }
    let entry: string;
    try { entry = require.resolve(`${name}/package.json`); }
    catch {
      try { entry = require.resolve(name); }
      catch { continue; }
    }
    let dir = dirname(entry);
    for (;;) {
      const text = await optionalText(join(dir, 'package.json'));
      if (text) {
        const manifest = object(JSON.parse(text), 'package.json') as PackageManifest;
        if (manifest.name === name) return { manifest, directory: await realpath(dir) };
      }
      if (dirname(dir) === dir) break;
      dir = dirname(dir);
    }
  }
  throw new Error(`找不到已安装的 ${name}，未导入插件代码`);
}

export async function declaredRows(directory: string, manifest: PackageManifest): Promise<{ rowIds: string[]; duplicateRowIds: string[] }> {
  const patch = manifest.dsh?.bundle?.patch;
  if (!patch) return { rowIds: [], duplicateRowIds: [] };
  const files = typeof patch === 'string' ? [patch] : patch;
  if (!Array.isArray(files) || files.some(x => typeof x !== 'string')) throw new Error('bundle.patch 格式无效');
  const rowIds: string[] = [], duplicates = new Set<string>();
  for (const file of files) {
    const path = within(directory, resolve(directory, file));
    within(await realpath(directory), await realpath(path));
    // !!js is retained as text. Inspection never evaluates Cordis expressions.
    const document = parseDocument(await readFile(path, 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (text: string) => text }] });
    if (document.errors.length) throw new Error(`无法解析 ${file}: ${document.errors[0].message}`);
    const patches: unknown = document.toJS({ maxAliasCount: 100 });
    if (!Array.isArray(patches)) throw new Error('bundle patch 必须是数组');
    for (const patch of patches) {
      if (!patch || typeof patch !== 'object' || !Array.isArray(patch.insert)) continue;
      for (const row of patch.insert) {
        if (typeof row?.id !== 'string' || typeof row?.name !== 'string') continue;
        if (rowIds.includes(row.id)) duplicates.add(row.id); else rowIds.push(row.id);
      }
    }
  }
  return { rowIds, duplicateRowIds: [...duplicates] };
}

/** Detect absent built browser artifacts without importing any plugin or executing browser code. */
async function checkClientArtifact(directory: string, manifest: PackageManifest): Promise<void> {
  const dsh = manifest.dsh as { client?: { platform?: string } } | undefined;
  if (dsh?.client?.platform !== 'web') return;
  const exported = (manifest.exports as Record<string, unknown> | undefined)?.['./client'];
  const client = typeof exported === 'string' ? exported : exported && typeof exported === 'object' ? (exported as Record<string, unknown>).default : undefined;
  if (typeof client !== 'string' || !client.startsWith('./')) throw new Error(`${manifest.name} 缺少可用的 ./client 导出`);
  const file = within(directory, resolve(directory, client));
  within(await realpath(directory), await realpath(file));
}

export async function scanProfile(directory: string, installAnchor?: string): Promise<PluginRecord[]> {
  const profilePath = join(directory, 'package.json');
  const manifest = object(JSON.parse(await readFile(profilePath, 'utf8')), 'profile package.json') as PackageManifest;
  const selected = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(selected) || selected.some(x => typeof x !== 'string')) throw new Error('目标目录没有有效的 dsh.profile.bundles');
  const names = [...new Set([...selected, ...Object.keys(manifest.dependencies ?? {})])];
  const records: PluginRecord[] = [];
  for (const name of names) {
    const base = { name, enabled: selected.includes(name), protected: isProtected(name), removable: Object.hasOwn(manifest.dependencies ?? {}, name) && !isProtected(name) };
    try {
      const { manifest: installed, directory: packageDir } = await locateManifest(name, [...(installAnchor ? [installAnchor] : []), profilePath]);
      if (!installed.dsh?.bundle && !base.enabled) continue;
      let rows: { rowIds: string[]; duplicateRowIds: string[] } = { rowIds: [], duplicateRowIds: [] };
      let loadError: string | undefined;
      try { rows = await declaredRows(packageDir, installed); await checkClientArtifact(packageDir, installed); }
      catch (error) { loadError = String(error); }
      if (!installed.dsh?.bundle) loadError = `${name} 未声明 dsh.bundle`;
      records.push({ ...base, version: installed.version ?? 'unknown', manifest: installed, directory: packageDir, ...rows,
        ...(loadError ? { loadError } : {}) });
    } catch (error) {
      records.push({ ...base, version: 'unknown', manifest: {}, rowIds: [], loadError: String(error) });
    }
  }
  return records;
}
