/** Task vocabulary and evidence required before inferring a package's capabilities. */
export const capabilityRules: Record<string, { task: RegExp; evidence: RegExp; query: string; label: string }> = {
  pdf: { task: /\bpdf\b|扫描件|扫描文档/iu, evidence: /\bpdf\b/iu, query: 'pdf', label: 'PDF' },
  web: { task: /\b(web|search|browse|online|latest|documentation)\b|联网|搜索|检索|查.{0,5}资料|最新|网页|官方文档/iu, evidence: /search|web|搜索|检索/iu, query: 'search', label: '联网检索' },
  code: { task: /\b(code|repo|repository|debug|refactor|typescript|python)\b|代码|仓库|调试|重构|编程|项目/iu, evidence: /code|coding|代码|编程/iu, query: 'coding', label: '代码分析' },
  git: { task: /\bgit\b|\bcommit\b|\bbranch\b|分支|提交|合并/iu, evidence: /\bgit\b/iu, query: 'git', label: 'Git' },
  browser: { task: /\b(browser|playwright|puppeteer)\b|浏览器|点击网页|表单/iu, evidence: /browser|playwright|puppeteer|浏览器/iu, query: 'browser', label: '浏览器' },
  vision: { task: /\b(vision|image|ocr)\b|识图|图片|图像|截图/iu, evidence: /vision|image|ocr|图像|识图|图片/iu, query: 'vision', label: '图像识别' },
  memory: { task: /\bmemory\b|长期记忆|跨会话记忆/iu, evidence: /memory|记忆/iu, query: 'memory', label: '长期记忆' },
  shell: { task: /\b(shell|terminal|command)\b|终端|命令行/iu, evidence: /shell|terminal|终端/iu, query: 'terminal', label: '终端' },
  math: { task: /\b(math|mathematics|mathematical|theorem|proof|sympy)\b|数学|定理|代数|几何|微积分|符号计算/iu, evidence: /\b(math|mathematics|mathematical|theorem|sympy)\b|数学|定理|符号计算/iu, query: 'math', label: '数学研究' },
  research: { task: /\b(research|academic|scholar|arxiv|literature)\b|研究|科研|学术|文献|论文/iu, evidence: /academic|scholar|arxiv|literature|scientific|科研|学术|文献|论文/iu, query: 'research', label: '学术研究' },
  latex: { task: /\b(latex|tex|bibtex|overleaf)\b|论文排版/iu, evidence: /latex|bibtex|overleaf|论文排版/iu, query: 'latex', label: 'LaTeX 排版' },
  'data-analysis': { task: /\b(statistics|data analysis|pandas|dataset)\b|数据分析|统计分析|数据集/iu, evidence: /data.analysis|statistics|pandas|数据分析|统计分析/iu, query: 'data analysis', label: '数据分析' },
  spreadsheet: { task: /\b(excel|spreadsheet|xlsx)\b|电子表格/iu, evidence: /excel|spreadsheet|xlsx|电子表格/iu, query: 'spreadsheet', label: '电子表格' },
  writing: { task: /\b(writing|copywriting)\b|写作|润色|撰写/iu, evidence: /writing|copywriting|写作|润色|撰写/iu, query: 'writing', label: '写作' },
  presentation: { task: /\b(ppt|pptx|presentation|slides)\b|幻灯片|演示文稿/iu, evidence: /pptx?|presentation|slides|幻灯片|演示文稿/iu, query: 'presentation', label: '演示文稿' },
};
export function inferCapabilities(task: string): string[] {
  if (!task.trim() || task.length > 30000) throw new Error('任务需要 1–30000 个字符');
  const matched = Object.entries(capabilityRules).filter(([, rule]) => rule.task.test(task)).map(([key]) => key);
  return matched.length ? matched : ['task-specific'];
}
export function searchText(capability: string, task: string): string {
  return capabilityRules[capability]?.query ?? (capability === 'task-specific' ? task : capability)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().slice(0, 160);
}
export function relevance(capability: string, text: string, task: string): number {
  if (/plugin.{0,12}(marketplace|market|directory|registry)|插件.{0,4}(市场|目录|商店)/iu.test(text)) return 0;
  if (['math', 'research'].includes(capability) && /financial|finance|trading|crypto|炒股|投资|金融|基金/iu.test(text)) return 0;
  const rule = capabilityRules[capability];
  if (rule) return rule.evidence.test(text) ? 1 : 0;
  const words = searchText(capability, task).toLowerCase().split(/\s+/u).filter(x => x.length > 2);
  return words.some(x => text.toLowerCase().includes(x)) ? 1 : 0;
}
