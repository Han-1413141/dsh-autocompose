import semver from 'semver';
import { compatMetadata, object, strings, string } from './validation.ts';
import type { CompatibilityReport, CompatMetadata, Finding, PluginRecord } from './types.ts';

export interface CheckOptions { nodeVersion?: string; platform?: string; dependencyVersions?: Record<string, string>; runtimeCompanions?: ReadonlySet<string>; activePlugins?: ReadonlySet<string> }
function matches(value: string, range: string): boolean {
  return Boolean(semver.valid(value) && range.trim() && semver.validRange(range)
    && semver.satisfies(value, range, { includePrerelease: true }));
}

function findingsFor(records: PluginRecord[], runtime: string, options: CheckOptions): Finding[] {
  const active = records.filter(x => x.enabled);
  const byName = new Map(active.map(x => [x.name, x]));
  const findings: Finding[] = [];
  const claims = new Map<string, string[]>();
  const add = (code: Finding['code'], plugins: string[], message: string, severity: Finding['severity'] = 'error') => {
    findings.push({ code, plugins, message, severity });
  };
  for (const plugin of active) {
    let meta: CompatMetadata;
    try {
      meta = compatMetadata(plugin.manifest.dshCompat);
      for (const field of ['dependencies', 'peerDependencies'] as const) {
        if (plugin.manifest[field] !== undefined) {
          for (const [name, range] of Object.entries(object(plugin.manifest[field], field))) string(range, `${field}.${name}`);
        }
      }
      if (plugin.manifest.os !== undefined) strings(plugin.manifest.os, 'os');
      if (plugin.manifest.engines !== undefined) {
        const engines = object(plugin.manifest.engines, 'engines');
        if (engines.node !== undefined) string(engines.node, 'engines.node');
      }
    }
    catch (error) { add('invalid-metadata', [plugin.name], String(error)); continue; }
    const peers = plugin.manifest.peerDependencies ?? {};
    if (!peers || typeof peers !== 'object' || Array.isArray(peers)) {
      add('invalid-metadata', [plugin.name], 'peerDependencies 必须是对象'); continue;
    }
    const dshPeers = Object.entries(peers).filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'));
    const ranges: [string, unknown][] = [...dshPeers, ...(meta.dsh ? [['dshCompat.dsh', meta.dsh] as [string, string]] : [])];
    if (!ranges.length && !plugin.protected) add('unknown-compatibility', [plugin.name], `${plugin.name} 未声明 DSH 版本范围；兼容性未知`, 'warning');
    for (const [name, range] of options.runtimeCompanions?.has(plugin.name) ? [] : ranges) {
      const normalized = typeof range === 'string' && ['workspace:*', 'workspace:^', 'workspace:~'].includes(range) ? runtime : range;
      if (typeof normalized !== 'string' || !matches(runtime, normalized)) {
        add('dsh-version', [plugin.name], `${plugin.name}@${plugin.version} 要求 ${name} ${String(range)}，当前 DSH 为 ${runtime}`);
      }
    }
    const sharedRuntime = new Set(['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-sandbox-policy']);
    for (const [name, range] of Object.entries(plugin.manifest.dependencies ?? {})) {
      if (!options.runtimeCompanions?.has(plugin.name) && sharedRuntime.has(name) && (typeof range !== 'string' || (!range.startsWith('workspace:') && !matches(runtime, range)))) {
        add('embedded-runtime', [plugin.name], `${plugin.name} 直接依赖 ${name} ${String(range)}，会引入与宿主 ${runtime} 不一致的核心组件；应由维护者改为匹配的 peerDependencies`);
      }
    }
    if (plugin.manifest.engines?.node && !matches(options.nodeVersion ?? process.version, plugin.manifest.engines.node)) {
      add('node-version', [plugin.name], `${plugin.name} 要求 Node.js ${plugin.manifest.engines.node}`);
    }
    const platform = options.platform ?? process.platform;
    const os = plugin.manifest.os;
    if ((os && (os.includes(`!${platform}`) || (os.some(x => !x.startsWith('!')) && !os.includes(platform))))
      || (meta.platforms && !meta.platforms.includes(platform))) add('platform', [plugin.name], `${plugin.name} 不支持 ${platform}`);
    for (const [name, range] of Object.entries(meta.requires ?? {})) {
      const dependency = byName.get(name);
      if (!dependency) add('missing-dependency', [plugin.name], `${plugin.name} 需要启用 ${name} ${range}`);
      else if (!matches(dependency.version, range)) add('dependency-version', [plugin.name], `${plugin.name} 需要 ${name} ${range}，实际为 ${dependency.version}`);
    }
    for (const [name, range] of Object.entries(peers)) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-') || typeof range !== 'string') continue;
      const dependency = byName.get(name)?.version ?? options.dependencyVersions?.[name];
      if (dependency && !range.startsWith('workspace:') && !matches(dependency, range)) {
        add('dependency-version', [plugin.name], `${plugin.name} 要求 peer ${name} ${range}，实际为 ${dependency}`);
      }
    }
    for (const [name, range] of Object.entries(meta.conflicts ?? {})) {
      const other = byName.get(name);
      if (other && other !== plugin && matches(other.version, range)) add('declared-conflict', [plugin.name, name], `${plugin.name} 与 ${name}@${other.version} 冲突`);
    }
    if (plugin.loadError || plugin.state === 'failed') add('load-failure', [plugin.name], plugin.loadError ?? `${plugin.name} 的运行实例加载失败`);
    for (const id of plugin.duplicateRowIds ?? []) add('duplicate-row', [plugin.name], `${plugin.name} 重复声明顶层条目 ${id}`);
    for (const [kind, values] of [['row', plugin.rowIds], ['service', meta.services ?? []], ['tool', meta.tools ?? []]] as const) {
      for (const value of new Set(values)) {
        const key = `${kind}:${value}`;
        claims.set(key, [...(claims.get(key) ?? []), plugin.name]);
      }
    }
  }
  for (const [claim, plugins] of claims) {
    if (plugins.length < 2) continue;
    const [kind, ...name] = claim.split(':');
    add(`duplicate-${kind}` as Finding['code'], plugins, `${plugins.join('、')} 重复提供 ${kind} ${name.join(':')}`);
  }
  return findings;
}

/** Deterministic removal plan; missing metadata never becomes evidence for removal. */
export function checkCompatibility(records: PluginRecord[], runtimeVersion: string, options: CheckOptions = {}): CompatibilityReport {
  if (!semver.valid(runtimeVersion)) throw new Error(`无效 DSH 版本：${runtimeVersion}`);
  const findings = findingsFor(records, runtimeVersion, options);
  const working = records.map(x => ({ ...x }));
  const quarantine: string[] = [];
  for (let step = 0; step < records.length; step++) {
    const errors = findingsFor(working, runtimeVersion, options).filter(x => x.severity === 'error');
    const candidates = working.filter(x => x.enabled && !x.protected && errors.some(f => f.plugins.includes(x.name)));
    if (!candidates.length) break;
    // Preserve the actual working provider when parallel loading picked the other registrant.
    // Without live evidence, lower priority loses; preserve earlier bundle precedence on a tie.
    candidates.sort((a, b) => Number(options.activePlugins?.has(a.name) ?? false) - Number(options.activePlugins?.has(b.name) ?? false)
      || (Number(a.manifest.dshCompat?.priority) || 0) - (Number(b.manifest.dshCompat?.priority) || 0)
      || working.indexOf(b) - working.indexOf(a));
    const candidate = candidates[0];
    candidate.enabled = false;
    quarantine.push(candidate.name);
  }
  return { runtimeVersion, findings, quarantine, unresolved: findingsFor(working, runtimeVersion, options).filter(x => x.severity === 'error') };
}
