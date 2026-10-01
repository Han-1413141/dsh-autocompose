import test from 'node:test';
import assert from 'node:assert/strict';
import { planTask } from '../src/planning.ts';
import { inferCapabilities } from '../src/planner.ts';

const pkg = (name: string, description: string, extra: object = {}) => ({ name, description, version: '1.0.0',
  keywords: ['dsh-plugin'], dsh: { bundle: { patch: './cordis.patch.yml' } }, dist: { integrity: 'sha512-fixture' },
  peerDependencies: { '@deepseek-ai/dsh-tools': '0.2.0-rc.2' }, ...extra });
test('数学研究启动搜索，选择真正提供能力的包，排除市场、旧版本和无 bundle 的占位包', async t => {
  const packages = [pkg('dsh-market', 'Plugin marketplace for math and academic research'),
    pkg('dsh-old', 'Mathematics and academic research', { peerDependencies: { '@deepseek-ai/dsh-tools': '<0.1.0' } }),
    pkg('dsh-reserved', 'math research academic', { dsh: undefined }),
    pkg('dsh-good-math', 'Mathematical theorem-proving and verification'),
    pkg('dsh-good-scholar', 'Academic literature research', { keywords: ['deepseek-harness'] })];
  const queries: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/search')) {
      const query = url.searchParams.get('text')!; queries.push(query);
      const values = query.startsWith('keywords:deepseek-harness') ? packages : packages.slice(0, -1);
      return Response.json({ objects: values.map(p => ({ package: p })) });
    }
    const data = packages.find(p => url.pathname === `/${p.name}/${p.version}`);
    assert(data); return Response.json(data);
  });
  const plan = await planTask({ task: '我要进行数学研究', cwd: process.cwd() });
  assert.deepEqual(plan.capabilities, ['math', 'research']); assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.selected.filter(x => x.source === 'npm').map(x => x.name).sort(), ['dsh-good-math', 'dsh-good-scholar']);
  assert(queries.some(x => x === 'keywords:deepseek-harness research'));
  assert(plan.explanation.some(x => x.includes('dsh-old') && x.includes('排除')));
});
test('陌生任务仍搜索原文，找不到时保留缺项；网络失败提供具体原因', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ objects: [] }));
  const plan = await planTask({ task: '编排陶艺课程', cwd: process.cwd() });
  assert.deepEqual(plan.missing, ['task-specific']); assert.equal(plan.discovery?.[0].query, '编排陶艺课程');
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline-fixture'); });
  const offline = await planTask({ task: '数学研究', cwd: process.cwd() });
  assert.deepEqual(offline.missing, ['math', 'research']); assert.match(offline.discovery![0].error!, /offline-fixture/);
});
test('取消会中断搜索，不把取消当作一个成功的空方案', async t => {
  const abort = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { abort.abort(); throw abort.signal.reason; });
  await assert.rejects(planTask({ task: '数学研究', cwd: process.cwd(), signal: abort.signal }), /abort/i);
});
test('新能力覆盖中文任务，明确的基础能力不触发多余插件安装', () => {
  assert.deepEqual(inferCapabilities('检查代码和 Git 变更'), ['code', 'git']);
  assert.deepEqual(inferCapabilities('LaTeX 论文排版和统计分析'), ['research', 'latex', 'data-analysis']);
});
