import { readJson, digest } from '../shared/files.ts';
import { compatMetadata, object, packageName, strings, string, version } from '../shared/validation.ts';
import type { PackageManifest } from '../shared/types.ts';

export interface Candidate {
  name: string;
  version: string;
  capabilities: string[];
  permissions: string[];
  description: string;
  source: 'builtin' | 'npm';
  manifest: PackageManifest;
  integrity?: string;
  metadataHash?: string;
  capabilitySource?: 'builtin' | 'catalog' | 'manifest' | 'search';
}
export const RUNTIME_VERSION = '0.2.0-rc.2';
export const registryUrl = 'https://registry.npmjs.org';

export function packageMetadata(data: PackageManifest): PackageManifest {
  return { name: data.name, version: data.version, description: data.description, dsh: data.dsh,
    dependencies: data.dependencies, peerDependencies: data.peerDependencies, peerDependenciesMeta: data.peerDependenciesMeta,
    engines: data.engines, os: data.os, dshCompat: data.dshCompat };
}

export const builtins: Candidate[] = [{
  name: '@deepseek-ai/dsh-base', version: RUNTIME_VERSION,
  capabilities: ['code', 'git', 'web', 'shell'], permissions: ['workspace-read', 'workspace-write', 'network', 'process'],
  description: '官方 SDK 基础环境已提供代码读取、Git/终端和联网工具。',
  source: 'builtin', capabilitySource: 'builtin', manifest: { peerDependencies: { '@deepseek-ai/dsh': RUNTIME_VERSION } },
}];

async function registryJson(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${registryUrl}/${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`npm 查询失败：${response.status} ${path}`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('npm 返回内容过大');
  return object(JSON.parse(text), 'npm response');
}

/** Fetch metadata only; never import or execute a discovered package. */
export async function inspectCandidate(name: string, exactVersion: string, capabilities?: string[], signal?: AbortSignal): Promise<Candidate> {
  packageName(name); version(exactVersion);
  const data = await registryJson(`${encodeURIComponent(name)}/${encodeURIComponent(exactVersion)}`, signal) as PackageManifest;
  if (data.name !== name || data.version !== exactVersion) throw new Error('npm 包身份与请求不一致');
  if (!data.dsh?.bundle?.patch) throw new Error(`${name} 未声明 DSH bundle`);
  const meta = compatMetadata(data.dshCompat);
  const dist = object(data.dist, 'npm dist');
  const integrity = string(dist.integrity, 'dist.integrity');
  const manifest = packageMetadata(data);
  return { name, version: exactVersion, capabilities: capabilities ?? meta.capabilities ?? [],
    permissions: meta.permissions ?? ['host-code: filesystem, network, processes'],
    description: data.description ?? name, source: 'npm', manifest, integrity, capabilitySource: capabilities ? 'catalog' : 'manifest',
    metadataHash: digest(JSON.stringify(manifest)) };
}

/** Discovery returns suggestions; planning inspects exact metadata before selecting any candidate. */
export interface SearchSuggestion { name: string; version: string; description: string; links: unknown; status: string }
export async function discover(capability: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(capability)) throw new Error('能力名称须为英文单词或短横线组合');
  const result = await registryJson(`-/v1/search?text=${encodeURIComponent(`keywords:dsh-plugin ${capability}`)}&size=12`, signal);
  if (!Array.isArray(result.objects)) return [];
  return result.objects.map(item => {
    const pkg = object(object(item, 'search item').package, 'package');
    return { name: string(pkg.name, 'name'), version: string(pkg.version, 'version'), description: typeof pkg.description === 'string' ? pkg.description : '',
      links: pkg.links, status: '搜索建议；需核验元数据和安装计划' };
  });
}

export async function loadCatalog(path?: string, signal?: AbortSignal): Promise<Candidate[]> {
  if (!path) return [...builtins];
  const data = object(await readJson<unknown>(path), 'catalog');
  if (data.schemaVersion !== 1 || !Array.isArray(data.plugins)) throw new Error('目录需要 schemaVersion: 1 和 plugins 数组');
  if (data.plugins.length > 60) throw new Error('一个目录最多支持 60 个候选插件');
  const candidates = [...builtins];
  for (const value of data.plugins) {
    const item = object(value, 'catalog plugin');
    candidates.push(await inspectCandidate(string(item.name, 'name'), string(item.version, 'version'), strings(item.capabilities, 'capabilities'), signal));
  }
  return candidates;
}
