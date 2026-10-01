import { discover, inspectCandidate, loadCatalog, RUNTIME_VERSION, type Candidate } from './catalog.ts';
import { createPlan, type ComposePlan } from './planner.ts';
import { capabilityRules, relevance, searchText } from './capabilities.ts';
import { digest } from '../shared/files.ts';

export interface PlanningProgress { message: string; capability?: string; checked: number }
/** Search metadata, then check exact versions. Never execute a search result while planning. */
export async function planTask(input: { task: string; cwd: string; catalog?: string; capabilities?: string[];
  owner?: string; autoDiscover?: boolean; signal?: AbortSignal; onProgress?: (value: PlanningProgress) => void }): Promise<ComposePlan> {
  const emit = (value: PlanningProgress) => { try { input.onProgress?.(value); } catch { /* Observers do not control planning. */ } };
  emit({ message: '识别任务所需能力', checked: 0 });
  const catalog = await loadCatalog(input.catalog, input.signal);
  const initial = createPlan({ ...input, catalog, runtimeVersion: RUNTIME_VERSION });
  if (input.autoDiscover === false || !initial.missing.length) return initial;
  const notes: string[] = [], found: Candidate[] = [], discovery: NonNullable<ComposePlan['discovery']> = [];
  const inspected = new Map<string, Promise<Candidate>>();
  for (const capability of initial.missing.slice(0, 6)) {
    const query = searchText(capability, input.task);
    const detail: typeof discovery[number] = { capability, query, checked: 0, accepted: [] };
    discovery.push(detail);
    emit({ message: `正在搜索${capabilityRules[capability]?.label ?? '任务相关'}插件：${query}`, capability, checked: inspected.size });
    try {
      const suggestions = (await discover(query, input.signal)).filter(x => !x.name.startsWith('@deepseek-ai/') &&
        relevance(capability, `${x.name} ${x.description} ${x.keywords.join(' ')}`, input.task)).slice(0, 8);
      const checked = await Promise.allSettled(suggestions.map(async suggestion => {
        const key = `${suggestion.name}@${suggestion.version}`;
        if (!inspected.has(key)) inspected.set(key, inspectCandidate(suggestion.name, suggestion.version, undefined, input.signal));
        const candidate = structuredClone(await inspected.get(key)!);
        // Registry summaries can be stale. Infer capabilities from the exact version's metadata.
        if (!candidate.capabilities.length) {
          const evidence = `${candidate.name} ${candidate.description} ${candidate.keywords?.join(' ') ?? ''}`;
          if (!relevance(capability, evidence, input.task)) throw new Error('精确版本说明未提供该能力');
          candidate.capabilities = [capability]; candidate.capabilitySource = 'search';
          candidate.relevance = /theorem.proving|problem.solving|verification|literature|arxiv|科研|学术/iu.test(evidence) ? 4 : 1;
        } else if (!candidate.capabilities.includes(capability)) throw new Error('能力声明未包含所需能力');
        else candidate.relevance = 8;
        return candidate;
      }));
      input.signal?.throwIfAborted();
      detail.checked = suggestions.length;
      checked.forEach((result, index) => {
        if (result.status === 'fulfilled') { found.push(result.value); detail.accepted.push(result.value.name); }
        else notes.push(`${suggestions[index].name} 未进入候选：${String(result.reason)}`);
      });
      if (!detail.accepted.length) notes.push(`${query}：没有找到说明与任务匹配且元数据完整的 DSH 插件。`);
    } catch (error) {
      input.signal?.throwIfAborted();
      detail.error = String(error); notes.push(`${query} 在线发现失败：${String(error)}`);
    }
  }
  if (initial.missing.length > 6) notes.push('本次已搜索六种缺失能力，请拆分任务以继续查找剩余能力。');
  const unique = new Map(catalog.map(x => [`${x.name}@${x.version}`, x]));
  for (const candidate of found) {
    const key = `${candidate.name}@${candidate.version}`, existing = unique.get(key);
    if (existing?.capabilitySource === 'search') existing.capabilities = [...new Set([...existing.capabilities, ...candidate.capabilities])];
    else if (!existing) unique.set(key, candidate);
  }
  emit({ message: '检查插件组合、DSH 版本与依赖', checked: inspected.size });
  const plan = createPlan({ ...input, catalog: [...unique.values()], runtimeVersion: RUNTIME_VERSION });
  plan.discovery = discovery;
  for (const candidate of plan.selected.filter(x => x.capabilitySource === 'search')) {
    notes.push(`${candidate.name} 的能力根据 npm 精确版本说明推断，功能尚未运行验证。`);
  }
  plan.explanation.push(...notes);
  const { fingerprint: _old, ...body } = plan;
  plan.fingerprint = digest(JSON.stringify(body));
  return plan;
}
