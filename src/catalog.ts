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
  keywords?: string[];
  relevance?: number;
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
    keywords: Array.isArray(data.keywords) ? data.keywords.filter((x): x is string => typeof x === 'string') : [],
    metadataHash: digest(JSON.stringify(manifest)) };
}

/** Discovery returns suggestions; planning inspects exact metadata before selecting any candidate. */
export interface SearchSuggestion { name: string; version: string; description: string; keywords: string[]; links: unknown; status: string }
export async function discover(capability: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s-]{0,159}$/u.test(capability.trim())) throw new Error('搜索关键词需为 1–160 个中英文、数字、空格或短横线');
  const results = await Promise.allSettled(['keywords:dsh-plugin', 'keywords:deepseek-harness'].map(scope =>
    registryJson(`-/v1/search?text=${encodeURIComponent(`${scope} ${capability.trim()}`)}&size=20`, signal)));
  signal?.throwIfAborted();
  if (results.every(x => x.status === 'rejected')) throw new Error(results.map(x => x.status === 'rejected' ? String(x.reason) : '').join('；'));
  const unique = new Map<string, SearchSuggestion>();
  for (const result of results) {
    if (result.status !== 'fulfilled' || !Array.isArray(result.value.objects)) continue;
    for (const item of result.value.objects) {
      const pkg = object(object(item, 'search item').package, 'package');
      const suggestion = { name: string(pkg.name, 'name'), version: string(pkg.version, 'version'), description: typeof pkg.description === 'string' ? pkg.description : '',
        keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter((x): x is string => typeof x === 'string') : [], links: pkg.links, status: '搜索建议；需核验元数据和安装计划' };
      unique.set(`${suggestion.name}@${suggestion.version}`, suggestion);
    }
  }
  return [...unique.values()];
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
