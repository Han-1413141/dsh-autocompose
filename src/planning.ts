import { discover, inspectCandidate, loadCatalog, RUNTIME_VERSION, type Candidate } from './catalog.ts';
import { createPlan, type ComposePlan } from './planner.ts';
import { digest } from '../shared/files.ts';

const hints: Record<string, RegExp> = {
  pdf: /\bpdf\b|PDF|文档/iu, browser: /browser|playwright|puppeteer|浏览器/iu,
  vision: /vision|image|ocr|图像|识图|图片/iu, memory: /memory|记忆/iu,
};
/** Search public package metadata for missing capabilities; user approval remains at run. */
export async function planTask(input: { task: string; cwd: string; catalog?: string; capabilities?: string[];
  owner?: string; autoDiscover?: boolean; signal?: AbortSignal }): Promise<ComposePlan> {
  const catalog = await loadCatalog(input.catalog, input.signal);
  const initial = createPlan({ ...input, catalog, runtimeVersion: RUNTIME_VERSION });
  if (input.autoDiscover === false || !initial.missing.length) return initial;
  const notes: string[] = [];
  const found: Candidate[] = [];
  for (const capability of initial.missing.slice(0, 4)) {
    if (!hints[capability]) continue;
    try {
      const suggestions = (await discover(capability, input.signal)).filter(x => hints[capability].test(`${x.name} ${x.description}`)).slice(0, 5);
      const checked = await Promise.allSettled(suggestions.map(async suggestion => {
        const candidate = await inspectCandidate(suggestion.name, suggestion.version, undefined, input.signal);
        if (!candidate.capabilities.length) { candidate.capabilities = [capability]; candidate.capabilitySource = 'search'; }
        return candidate;
      }));
      checked.forEach((result, index) => {
        if (result.status === 'fulfilled') found.push(result.value);
        else notes.push(`${suggestions[index].name} 元数据未通过：${String(result.reason)}`);
      });
    } catch (error) {
      input.signal?.throwIfAborted();
      notes.push(`${capability} 在线发现失败：${String(error)}`);
    }
  }
  const unique = new Map(catalog.map(x => [`${x.name}@${x.version}`, x]));
  for (const candidate of found) {
    const key = `${candidate.name}@${candidate.version}`;
    const existing = unique.get(key);
    if (existing && existing.capabilitySource === 'search') existing.capabilities = [...new Set([...existing.capabilities, ...candidate.capabilities])];
    else if (!existing) unique.set(key, candidate);
  }
  const plan = createPlan({ ...input, catalog: [...unique.values()], runtimeVersion: RUNTIME_VERSION });
  for (const candidate of plan.selected.filter(x => x.capabilitySource === 'search')) {
    notes.push(`${candidate.name} 的能力根据 npm 名称与说明推断，尚未验证功能；完整权限以第三方 Host 代码为准。`);
  }
  plan.explanation.push(...notes);
  const { fingerprint: _old, ...body } = plan;
  plan.fingerprint = digest(JSON.stringify(body));
  return plan;
}
