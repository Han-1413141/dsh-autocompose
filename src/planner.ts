import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import semver from 'semver';
import { checkCompatibility } from '../shared/compatibility.ts';
import { digest, readJson, writeJson } from '../shared/files.ts';
import { compatMetadata } from '../shared/validation.ts';
import type { Candidate } from './catalog.ts';
import type { CompatibilityReport, PluginRecord } from '../shared/types.ts';

const patterns: Record<string, RegExp> = {
  pdf: /\bpdf\b|扫描件|扫描文档/iu,
  web: /\b(web|search|browse|online|latest|documentation)\b|联网|搜索|检索|查.{0,5}资料|最新|网页|官方文档/iu,
  code: /\b(code|repo|repository|debug|refactor|typescript|python)\b|代码|仓库|调试|重构|编程|项目/iu,
  git: /\bgit\b|\bcommit\b|\bbranch\b|分支|提交|合并/iu,
  browser: /\b(browser|playwright|puppeteer)\b|浏览器|点击网页|表单/iu,
  vision: /\b(vision|image|ocr)\b|识图|图片|图像|截图/iu,
  memory: /\bmemory\b|长期记忆|跨会话记忆/iu,
  shell: /\b(shell|terminal|command)\b|终端|命令行/iu,
};
export function inferCapabilities(task: string): string[] {
  if (!task.trim() || task.length > 30000) throw new Error('任务需要 1–30000 个字符');
  return Object.entries(patterns).filter(([, regex]) => regex.test(task)).map(([key]) => key);
}
export interface ComposePlan {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  task: string;
  cwd: string;
  owner?: string;
  runtimeVersion: string;
  capabilities: string[];
  selected: Candidate[];
  missing: string[];
  permissions: string[];
  report: CompatibilityReport;
  explanation: string[];
  fingerprint: string;
}
export function candidateRecord(candidate: Candidate): PluginRecord {
  return { name: candidate.name, version: candidate.version, manifest: candidate.manifest,
    rowIds: [], enabled: true, removable: candidate.source !== 'builtin', protected: candidate.source === 'builtin' };
}

export function createPlan(input: { task: string; cwd: string; runtimeVersion: string; catalog: Candidate[]; capabilities?: string[]; owner?: string }): ComposePlan {
  if (!input.task.trim() || input.task.length > 30000) throw new Error('任务需要 1–30000 个字符');
  const capabilities = [...new Set(input.capabilities ?? inferCapabilities(input.task))];
  if (capabilities.some(x => !/^[a-z][a-z0-9-]{0,40}$/.test(x))) throw new Error('能力名称格式无效');
  const selected = input.catalog.filter(x => x.source === 'builtin');
  const byName = new Map<string, Candidate[]>();
  for (const item of input.catalog) byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
  const coverage = () => new Set(selected.flatMap(x => x.capabilities));
  const explanation = ['使用独立 DSH_HOME 和 sdk profile；配置隔离不等于操作系统安全沙箱。'];
  const rejected = new Set<string>();
  const addDependencies = (candidate: Candidate, group: Map<string, Candidate>, visiting: Set<string>): boolean => {
    if (visiting.has(candidate.name)) return false;
    const existing = selected.find(x => x.name === candidate.name) ?? group.get(candidate.name);
    if (existing) return existing.version === candidate.version;
    group.set(candidate.name, candidate); visiting.add(candidate.name);
    for (const [name, range] of Object.entries(compatMetadata(candidate.manifest.dshCompat).requires ?? {})) {
      if (visiting.has(name)) return false;
      const chosen = selected.find(x => x.name === name) ?? group.get(name);
      if (chosen) { if (!semver.satisfies(chosen.version, range, { includePrerelease: true })) return false; continue; }
      const dependency = byName.get(name)?.filter(x => semver.satisfies(x.version, range, { includePrerelease: true })).sort((a, b) => semver.rcompare(a.version, b.version))[0];
      if (!dependency || !addDependencies(dependency, group, visiting)) return false;
    }
    visiting.delete(candidate.name); return true;
  };
  while (capabilities.some(x => !coverage().has(x))) {
    const alternatives: { group: Candidate[]; score: number; key: string }[] = [];
    for (const item of input.catalog) {
      const key = `${item.name}@${item.version}`;
      if (rejected.has(key) || selected.some(x => x.name === item.name)) continue;
      const group = new Map<string, Candidate>();
      if (!addDependencies(item, group, new Set())) { rejected.add(key); continue; }
      const values = [...group.values()];
      const gained = new Set(values.flatMap(x => x.capabilities).filter(x => capabilities.includes(x) && !coverage().has(x))).size;
      if (!gained) continue;
      const report = checkCompatibility([...selected, ...values].map(candidateRecord), input.runtimeVersion);
      if (report.findings.some(x => x.severity === 'error')) { rejected.add(key); explanation.push(`${key} 因兼容性或依赖问题被排除。`); continue; }
      const penalty = new Set(values.flatMap(x => x.permissions)).size;
      alternatives.push({ group: values, score: gained * 100 - values.length * 10 - penalty, key });
    }
    alternatives.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    if (!alternatives.length) break;
    for (const item of alternatives[0].group) {
      selected.push(item); explanation.push(`${item.name}@${item.version} 提供 ${item.capabilities.join('、') || '前置依赖'}。`);
    }
  }
  const body: Omit<ComposePlan, 'fingerprint'> = {
    schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), task: input.task,
    cwd: input.cwd, ...(input.owner ? { owner: input.owner } : {}), runtimeVersion: input.runtimeVersion,
    capabilities, selected, missing: capabilities.filter(x => !coverage().has(x)),
    permissions: [...new Set(selected.flatMap(x => x.permissions))],
    report: checkCompatibility(selected.map(candidateRecord), input.runtimeVersion), explanation,
  };
  return { ...body, fingerprint: digest(JSON.stringify(body)) };
}
export async function savePlan(root: string, plan: ComposePlan): Promise<void> {
  await writeJson(join(root, 'plans', `${plan.id}.json`), plan);
}
export async function loadPlan(root: string, id: string): Promise<ComposePlan> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('planId 格式无效');
  const plan = await readJson<ComposePlan>(join(root, 'plans', `${id}.json`));
  const { fingerprint, ...body } = plan;
  if (plan.schemaVersion !== 1 || plan.id !== id || digest(JSON.stringify(body)) !== fingerprint) throw new Error('计划内容已变化，请重新生成计划');
  return plan;
}
