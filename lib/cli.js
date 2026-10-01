#!/usr/bin/env node

// src/cli.ts
import { parseArgs } from "node:util";
import { resolve as resolve6 } from "node:path";
import { createRequire as createRequire3 } from "node:module";

// shared/files.ts
import { open, readFile, mkdir, rename, rm, realpath, lstat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { withFileLock } from "@deepseek-ai/dsh-atomic-write";
var digest = (value) => createHash("sha256").update(value).digest("hex");
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function optionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 384);
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
    await file.close();
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, path);
        break;
      } catch (error) {
        if (process.platform !== "win32" || attempt >= 6 || !["EPERM", "EACCES", "EBUSY"].includes(error.code ?? "")) throw error;
        await new Promise((done) => setTimeout(done, 20 * 2 ** attempt));
      }
    }
  } catch (error) {
    await file.close().catch(() => {
    });
    await rm(temporary, { force: true });
    throw error;
  }
}
var writeJson = (path, value) => atomicWrite(path, `${JSON.stringify(value, null, 2)}
`);
function within(root, target) {
  const absolute = resolve(target), rel = relative(resolve(root), absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`\u8DEF\u5F84\u8D85\u51FA\u6307\u5B9A\u76EE\u5F55\uFF1A${target}`);
  return absolute;
}
async function withLock(path, fn) {
  await mkdir(dirname(path), { recursive: true });
  return withFileLock(path.endsWith(".lock") ? path.slice(0, -5) : path, fn, { waitMs: 1e3 });
}
async function removeOwnedRun(root, directory, id) {
  const actualRoot = await realpath(root), actual = await realpath(directory);
  within(actualRoot, actual);
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("\u62D2\u7EDD\u6E05\u7406\u7B26\u53F7\u94FE\u63A5");
  const marker = await readJson(resolve(actual, ".autocompose-owner.json"));
  if (marker.id !== id) throw new Error("\u4E34\u65F6\u8FD0\u884C\u76EE\u5F55\u6807\u8BB0\u4E0D\u5339\u914D");
  await rm(actual, { recursive: true });
}

// shared/validation.ts
import semver from "semver";
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} \u5FC5\u987B\u662F\u5BF9\u8C61`);
  return value;
}
function string(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  return value;
}
function strings(value, label) {
  if (!Array.isArray(value) || !value.every((x) => typeof x === "string" && x.length > 0)) throw new Error(`${label} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  return value;
}
function packageName(value) {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value) || value.length > 214) throw new Error(`\u65E0\u6548\u7684\u5305\u540D\uFF1A${value}`);
  return value;
}
function version(value) {
  if (!semver.valid(value)) throw new Error(`\u9700\u8981\u7CBE\u786E\u7248\u672C\u53F7\uFF1A${value}`);
  return value;
}
function compatMetadata(value) {
  if (value === void 0) return {};
  const data = object(value, "dshCompat");
  const out = {};
  for (const key of ["capabilities", "services", "tools", "permissions", "platforms"]) {
    if (data[key] !== void 0) out[key] = strings(data[key], `dshCompat.${key}`);
  }
  if (data.dsh !== void 0) {
    out.dsh = string(data.dsh, "dshCompat.dsh");
    if (!semver.validRange(out.dsh)) throw new Error("dshCompat.dsh \u7248\u672C\u8303\u56F4\u65E0\u6548");
  }
  for (const key of ["requires", "conflicts"]) {
    if (data[key] === void 0) continue;
    out[key] = {};
    for (const [name, range] of Object.entries(object(data[key], key))) {
      packageName(name);
      const rule = string(range, `${key}.${name}`);
      if (!semver.validRange(rule)) throw new Error(`${key}.${name} \u7248\u672C\u8303\u56F4\u65E0\u6548`);
      out[key][name] = rule;
    }
  }
  if (data.priority !== void 0) {
    if (typeof data.priority !== "number" || !Number.isFinite(data.priority)) throw new Error("priority \u5FC5\u987B\u662F\u6709\u9650\u6570\u503C");
    out.priority = data.priority;
  }
  return out;
}

// src/catalog.ts
var RUNTIME_VERSION = "0.2.0-rc.2";
var registryUrl = "https://registry.npmjs.org";
function packageMetadata(data) {
  return {
    name: data.name,
    version: data.version,
    description: data.description,
    dsh: data.dsh,
    dependencies: data.dependencies,
    peerDependencies: data.peerDependencies,
    peerDependenciesMeta: data.peerDependenciesMeta,
    engines: data.engines,
    os: data.os,
    dshCompat: data.dshCompat
  };
}
var builtins = [{
  name: "@deepseek-ai/dsh-base",
  version: RUNTIME_VERSION,
  capabilities: ["code", "git", "web", "shell"],
  permissions: ["workspace-read", "workspace-write", "network", "process"],
  description: "\u5B98\u65B9 SDK \u57FA\u7840\u73AF\u5883\u5DF2\u63D0\u4F9B\u4EE3\u7801\u8BFB\u53D6\u3001Git/\u7EC8\u7AEF\u548C\u8054\u7F51\u5DE5\u5177\u3002",
  source: "builtin",
  capabilitySource: "builtin",
  manifest: { peerDependencies: { "@deepseek-ai/dsh": RUNTIME_VERSION } }
}];
async function registryJson(path, signal) {
  const response = await fetch(`${registryUrl}/${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15e3)]) : AbortSignal.timeout(15e3), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`npm \u67E5\u8BE2\u5931\u8D25\uFF1A${response.status} ${path}`);
  const text = await response.text();
  if (text.length > 2e6) throw new Error("npm \u8FD4\u56DE\u5185\u5BB9\u8FC7\u5927");
  return object(JSON.parse(text), "npm response");
}
async function inspectCandidate(name, exactVersion, capabilities, signal) {
  packageName(name);
  version(exactVersion);
  const data = await registryJson(`${encodeURIComponent(name)}/${encodeURIComponent(exactVersion)}`, signal);
  if (data.name !== name || data.version !== exactVersion) throw new Error("npm \u5305\u8EAB\u4EFD\u4E0E\u8BF7\u6C42\u4E0D\u4E00\u81F4");
  if (!data.dsh?.bundle?.patch) throw new Error(`${name} \u672A\u58F0\u660E DSH bundle`);
  const meta = compatMetadata(data.dshCompat);
  const dist = object(data.dist, "npm dist");
  const integrity = string(dist.integrity, "dist.integrity");
  const manifest2 = packageMetadata(data);
  return {
    name,
    version: exactVersion,
    capabilities: capabilities ?? meta.capabilities ?? [],
    permissions: meta.permissions ?? ["host-code: filesystem, network, processes"],
    description: data.description ?? name,
    source: "npm",
    manifest: manifest2,
    integrity,
    capabilitySource: capabilities ? "catalog" : "manifest",
    keywords: Array.isArray(data.keywords) ? data.keywords.filter((x) => typeof x === "string") : [],
    metadataHash: digest(JSON.stringify(manifest2))
  };
}
async function discover(capability, signal) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s-]{0,159}$/u.test(capability.trim())) throw new Error("\u641C\u7D22\u5173\u952E\u8BCD\u9700\u4E3A 1\u2013160 \u4E2A\u4E2D\u82F1\u6587\u3001\u6570\u5B57\u3001\u7A7A\u683C\u6216\u77ED\u6A2A\u7EBF");
  const results = await Promise.allSettled(["keywords:dsh-plugin", "keywords:deepseek-harness"].map((scope) => registryJson(`-/v1/search?text=${encodeURIComponent(`${scope} ${capability.trim()}`)}&size=20`, signal)));
  signal?.throwIfAborted();
  if (results.every((x) => x.status === "rejected")) throw new Error(results.map((x) => x.status === "rejected" ? String(x.reason) : "").join("\uFF1B"));
  const unique = /* @__PURE__ */ new Map();
  for (const result of results) {
    if (result.status !== "fulfilled" || !Array.isArray(result.value.objects)) continue;
    for (const item of result.value.objects) {
      const pkg = object(object(item, "search item").package, "package");
      const suggestion = {
        name: string(pkg.name, "name"),
        version: string(pkg.version, "version"),
        description: typeof pkg.description === "string" ? pkg.description : "",
        keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter((x) => typeof x === "string") : [],
        links: pkg.links,
        status: "\u641C\u7D22\u5EFA\u8BAE\uFF1B\u9700\u6838\u9A8C\u5143\u6570\u636E\u548C\u5B89\u88C5\u8BA1\u5212"
      };
      unique.set(`${suggestion.name}@${suggestion.version}`, suggestion);
    }
  }
  return [...unique.values()];
}
async function loadCatalog(path, signal) {
  if (!path) return [...builtins];
  const data = object(await readJson(path), "catalog");
  if (data.schemaVersion !== 1 || !Array.isArray(data.plugins)) throw new Error("\u76EE\u5F55\u9700\u8981 schemaVersion: 1 \u548C plugins \u6570\u7EC4");
  if (data.plugins.length > 60) throw new Error("\u4E00\u4E2A\u76EE\u5F55\u6700\u591A\u652F\u6301 60 \u4E2A\u5019\u9009\u63D2\u4EF6");
  const candidates = [...builtins];
  for (const value of data.plugins) {
    const item = object(value, "catalog plugin");
    candidates.push(await inspectCandidate(string(item.name, "name"), string(item.version, "version"), strings(item.capabilities, "capabilities"), signal));
  }
  return candidates;
}

// src/planner.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { join } from "node:path";
import semver3 from "semver";

// shared/compatibility.ts
import semver2 from "semver";
function matches(value, range) {
  return Boolean(semver2.valid(value) && range.trim() && semver2.validRange(range) && semver2.satisfies(value, range, { includePrerelease: true }));
}
function findingsFor(records, runtime, options) {
  const active = records.filter((x) => x.enabled);
  const byName = new Map(active.map((x) => [x.name, x]));
  const findings = [];
  const claims = /* @__PURE__ */ new Map();
  const add = (code, plugins, message, severity = "error") => {
    findings.push({ code, plugins, message, severity });
  };
  for (const plugin of active) {
    let meta;
    try {
      meta = compatMetadata(plugin.manifest.dshCompat);
      for (const field of ["dependencies", "peerDependencies"]) {
        if (plugin.manifest[field] !== void 0) {
          for (const [name, range] of Object.entries(object(plugin.manifest[field], field))) string(range, `${field}.${name}`);
        }
      }
      if (plugin.manifest.os !== void 0) strings(plugin.manifest.os, "os");
      if (plugin.manifest.engines !== void 0) {
        const engines = object(plugin.manifest.engines, "engines");
        if (engines.node !== void 0) string(engines.node, "engines.node");
      }
    } catch (error) {
      add("invalid-metadata", [plugin.name], String(error));
      continue;
    }
    const peers = plugin.manifest.peerDependencies ?? {};
    if (!peers || typeof peers !== "object" || Array.isArray(peers)) {
      add("invalid-metadata", [plugin.name], "peerDependencies \u5FC5\u987B\u662F\u5BF9\u8C61");
      continue;
    }
    const dshPeers = Object.entries(peers).filter(([name]) => name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"));
    const ranges = [...dshPeers, ...meta.dsh ? [["dshCompat.dsh", meta.dsh]] : []];
    if (!ranges.length && !plugin.protected) add("unknown-compatibility", [plugin.name], `${plugin.name} \u672A\u58F0\u660E DSH \u7248\u672C\u8303\u56F4\uFF1B\u517C\u5BB9\u6027\u672A\u77E5`, "warning");
    for (const [name, range] of options.runtimeCompanions?.has(plugin.name) ? [] : ranges) {
      const normalized = typeof range === "string" && ["workspace:*", "workspace:^", "workspace:~"].includes(range) ? runtime : range;
      if (typeof normalized !== "string" || !matches(runtime, normalized)) {
        add("dsh-version", [plugin.name], `${plugin.name}@${plugin.version} \u8981\u6C42 ${name} ${String(range)}\uFF0C\u5F53\u524D DSH \u4E3A ${runtime}`);
      }
    }
    const sharedRuntime = /* @__PURE__ */ new Set(["@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-sandbox-policy"]);
    for (const [name, range] of Object.entries(plugin.manifest.dependencies ?? {})) {
      if (!options.runtimeCompanions?.has(plugin.name) && sharedRuntime.has(name) && (typeof range !== "string" || !range.startsWith("workspace:") && !matches(runtime, range))) {
        add("embedded-runtime", [plugin.name], `${plugin.name} \u76F4\u63A5\u4F9D\u8D56 ${name} ${String(range)}\uFF0C\u4F1A\u5F15\u5165\u4E0E\u5BBF\u4E3B ${runtime} \u4E0D\u4E00\u81F4\u7684\u6838\u5FC3\u7EC4\u4EF6\uFF1B\u5E94\u7531\u7EF4\u62A4\u8005\u6539\u4E3A\u5339\u914D\u7684 peerDependencies`);
      }
    }
    if (plugin.manifest.engines?.node && !matches(options.nodeVersion ?? process.version, plugin.manifest.engines.node)) {
      add("node-version", [plugin.name], `${plugin.name} \u8981\u6C42 Node.js ${plugin.manifest.engines.node}`);
    }
    const platform = options.platform ?? process.platform;
    const os = plugin.manifest.os;
    if (os && (os.includes(`!${platform}`) || os.some((x) => !x.startsWith("!")) && !os.includes(platform)) || meta.platforms && !meta.platforms.includes(platform)) add("platform", [plugin.name], `${plugin.name} \u4E0D\u652F\u6301 ${platform}`);
    for (const [name, range] of Object.entries(meta.requires ?? {})) {
      const dependency = byName.get(name);
      if (!dependency) add("missing-dependency", [plugin.name], `${plugin.name} \u9700\u8981\u542F\u7528 ${name} ${range}`);
      else if (!matches(dependency.version, range)) add("dependency-version", [plugin.name], `${plugin.name} \u9700\u8981 ${name} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency.version}`);
    }
    for (const [name, range] of Object.entries(peers)) {
      if (name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-") || typeof range !== "string") continue;
      const dependency = byName.get(name)?.version ?? options.dependencyVersions?.[name];
      if (dependency && !range.startsWith("workspace:") && !matches(dependency, range)) {
        add("dependency-version", [plugin.name], `${plugin.name} \u8981\u6C42 peer ${name} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency}`);
      }
    }
    for (const [name, range] of Object.entries(meta.conflicts ?? {})) {
      const other = byName.get(name);
      if (other && other !== plugin && matches(other.version, range)) add("declared-conflict", [plugin.name, name], `${plugin.name} \u4E0E ${name}@${other.version} \u51B2\u7A81`);
    }
    if (plugin.loadError || plugin.state === "failed") add("load-failure", [plugin.name], plugin.loadError ?? `${plugin.name} \u7684\u8FD0\u884C\u5B9E\u4F8B\u52A0\u8F7D\u5931\u8D25`);
    for (const id of plugin.duplicateRowIds ?? []) add("duplicate-row", [plugin.name], `${plugin.name} \u91CD\u590D\u58F0\u660E\u9876\u5C42\u6761\u76EE ${id}`);
    for (const [kind, values] of [["row", plugin.rowIds], ["service", meta.services ?? []], ["tool", meta.tools ?? []]]) {
      for (const value of new Set(values)) {
        const key = `${kind}:${value}`;
        claims.set(key, [...claims.get(key) ?? [], plugin.name]);
      }
    }
  }
  for (const [claim, plugins] of claims) {
    if (plugins.length < 2) continue;
    const [kind, ...name] = claim.split(":");
    add(`duplicate-${kind}`, plugins, `${plugins.join("\u3001")} \u91CD\u590D\u63D0\u4F9B ${kind} ${name.join(":")}`);
  }
  return findings;
}
function checkCompatibility(records, runtimeVersion, options = {}) {
  if (!semver2.valid(runtimeVersion)) throw new Error(`\u65E0\u6548 DSH \u7248\u672C\uFF1A${runtimeVersion}`);
  const findings = findingsFor(records, runtimeVersion, options);
  const working = records.map((x) => ({ ...x }));
  const quarantine = [];
  for (let step = 0; step < records.length; step++) {
    const errors = findingsFor(working, runtimeVersion, options).filter((x) => x.severity === "error");
    const candidates = working.filter((x) => x.enabled && !x.protected && errors.some((f) => f.plugins.includes(x.name)));
    if (!candidates.length) break;
    candidates.sort((a, b) => Number(options.activePlugins?.has(a.name) ?? false) - Number(options.activePlugins?.has(b.name) ?? false) || (Number(a.manifest.dshCompat?.priority) || 0) - (Number(b.manifest.dshCompat?.priority) || 0) || working.indexOf(b) - working.indexOf(a));
    const candidate = candidates[0];
    candidate.enabled = false;
    quarantine.push(candidate.name);
  }
  return { runtimeVersion, findings, quarantine, unresolved: findingsFor(working, runtimeVersion, options).filter((x) => x.severity === "error") };
}

// src/capabilities.ts
var capabilityRules = {
  pdf: { task: /\bpdf\b|扫描件|扫描文档/iu, evidence: /\bpdf\b/iu, query: "pdf", label: "PDF" },
  web: { task: /\b(web|search|browse|online|latest|documentation)\b|联网|搜索|检索|查.{0,5}资料|最新|网页|官方文档/iu, evidence: /search|web|搜索|检索/iu, query: "search", label: "\u8054\u7F51\u68C0\u7D22" },
  code: { task: /\b(code|repo|repository|debug|refactor|typescript|python)\b|代码|仓库|调试|重构|编程|项目/iu, evidence: /code|coding|代码|编程/iu, query: "coding", label: "\u4EE3\u7801\u5206\u6790" },
  git: { task: /\bgit\b|\bcommit\b|\bbranch\b|分支|提交|合并/iu, evidence: /\bgit\b/iu, query: "git", label: "Git" },
  browser: { task: /\b(browser|playwright|puppeteer)\b|浏览器|点击网页|表单/iu, evidence: /browser|playwright|puppeteer|浏览器/iu, query: "browser", label: "\u6D4F\u89C8\u5668" },
  vision: { task: /\b(vision|image|ocr)\b|识图|图片|图像|截图/iu, evidence: /vision|image|ocr|图像|识图|图片/iu, query: "vision", label: "\u56FE\u50CF\u8BC6\u522B" },
  memory: { task: /\bmemory\b|长期记忆|跨会话记忆/iu, evidence: /memory|记忆/iu, query: "memory", label: "\u957F\u671F\u8BB0\u5FC6" },
  shell: { task: /\b(shell|terminal|command)\b|终端|命令行/iu, evidence: /shell|terminal|终端/iu, query: "terminal", label: "\u7EC8\u7AEF" },
  math: { task: /\b(math|mathematics|mathematical|theorem|proof|sympy)\b|数学|定理|代数|几何|微积分|符号计算/iu, evidence: /\b(math|mathematics|mathematical|theorem|sympy)\b|数学|定理|符号计算/iu, query: "math", label: "\u6570\u5B66\u7814\u7A76" },
  research: { task: /\b(research|academic|scholar|arxiv|literature)\b|研究|科研|学术|文献|论文/iu, evidence: /academic|scholar|arxiv|literature|scientific|科研|学术|文献|论文/iu, query: "research", label: "\u5B66\u672F\u7814\u7A76" },
  latex: { task: /\b(latex|tex|bibtex|overleaf)\b|论文排版/iu, evidence: /latex|bibtex|overleaf|论文排版/iu, query: "latex", label: "LaTeX \u6392\u7248" },
  "data-analysis": { task: /\b(statistics|data analysis|pandas|dataset)\b|数据分析|统计分析|数据集/iu, evidence: /data.analysis|statistics|pandas|数据分析|统计分析/iu, query: "data analysis", label: "\u6570\u636E\u5206\u6790" },
  spreadsheet: { task: /\b(excel|spreadsheet|xlsx)\b|电子表格/iu, evidence: /excel|spreadsheet|xlsx|电子表格/iu, query: "spreadsheet", label: "\u7535\u5B50\u8868\u683C" },
  writing: { task: /\b(writing|copywriting)\b|写作|润色|撰写/iu, evidence: /writing|copywriting|写作|润色|撰写/iu, query: "writing", label: "\u5199\u4F5C" },
  presentation: { task: /\b(ppt|pptx|presentation|slides)\b|幻灯片|演示文稿/iu, evidence: /pptx?|presentation|slides|幻灯片|演示文稿/iu, query: "presentation", label: "\u6F14\u793A\u6587\u7A3F" }
};
function inferCapabilities(task) {
  if (!task.trim() || task.length > 3e4) throw new Error("\u4EFB\u52A1\u9700\u8981 1\u201330000 \u4E2A\u5B57\u7B26");
  const matched = Object.entries(capabilityRules).filter(([, rule]) => rule.task.test(task)).map(([key]) => key);
  return matched.length ? matched : ["task-specific"];
}
function searchText(capability, task) {
  return capabilityRules[capability]?.query ?? (capability === "task-specific" ? task : capability).replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().slice(0, 160);
}
function relevance(capability, text, task) {
  if (/plugin.{0,12}(marketplace|market|directory|registry)|插件.{0,4}(市场|目录|商店)/iu.test(text)) return 0;
  if (["math", "research"].includes(capability) && /financial|finance|trading|crypto|炒股|投资|金融|基金/iu.test(text)) return 0;
  const rule = capabilityRules[capability];
  if (rule) return rule.evidence.test(text) ? 1 : 0;
  const words = searchText(capability, task).toLowerCase().split(/\s+/u).filter((x) => x.length > 2);
  return words.some((x) => text.toLowerCase().includes(x)) ? 1 : 0;
}

// src/planner.ts
function candidateRecord(candidate) {
  return {
    name: candidate.name,
    version: candidate.version,
    manifest: candidate.manifest,
    rowIds: [],
    enabled: true,
    removable: candidate.source !== "builtin",
    protected: candidate.source === "builtin"
  };
}
function createPlan(input) {
  if (!input.task.trim() || input.task.length > 3e4) throw new Error("\u4EFB\u52A1\u9700\u8981 1\u201330000 \u4E2A\u5B57\u7B26");
  const capabilities = [...new Set(input.capabilities ?? inferCapabilities(input.task))];
  if (capabilities.some((x) => !/^[a-z][a-z0-9-]{0,40}$/.test(x))) throw new Error("\u80FD\u529B\u540D\u79F0\u683C\u5F0F\u65E0\u6548");
  const selected = input.catalog.filter((x) => x.source === "builtin");
  const byName = /* @__PURE__ */ new Map();
  for (const item of input.catalog) byName.set(item.name, [...byName.get(item.name) ?? [], item]);
  const coverage = () => new Set(selected.flatMap((x) => x.capabilities));
  const explanation = ["\u53EF\u9009\u62E9\u5728\u72EC\u7ACB DSH_HOME \u4E2D\u4E34\u65F6\u8FD0\u884C\uFF0C\u6216\u5C06\u9009\u4E2D\u7684\u7B2C\u4E09\u65B9\u63D2\u4EF6\u5B89\u88C5\u5230\u5F53\u524D\u4E3B\u73AF\u5883\u3002"];
  const rejected = /* @__PURE__ */ new Set();
  const addDependencies = (candidate, group, visiting) => {
    if (visiting.has(candidate.name)) return false;
    const existing = selected.find((x) => x.name === candidate.name) ?? group.get(candidate.name);
    if (existing) return existing.version === candidate.version;
    group.set(candidate.name, candidate);
    visiting.add(candidate.name);
    for (const [name, range] of Object.entries(compatMetadata(candidate.manifest.dshCompat).requires ?? {})) {
      if (visiting.has(name)) return false;
      const chosen = selected.find((x) => x.name === name) ?? group.get(name);
      if (chosen) {
        if (!semver3.satisfies(chosen.version, range, { includePrerelease: true })) return false;
        continue;
      }
      const dependency = byName.get(name)?.filter((x) => semver3.satisfies(x.version, range, { includePrerelease: true })).sort((a, b) => semver3.rcompare(a.version, b.version))[0];
      if (!dependency || !addDependencies(dependency, group, visiting)) return false;
    }
    visiting.delete(candidate.name);
    return true;
  };
  while (capabilities.some((x) => !coverage().has(x))) {
    const alternatives = [];
    for (const item of input.catalog) {
      const key = `${item.name}@${item.version}`;
      if (rejected.has(key) || selected.some((x) => x.name === item.name)) continue;
      const group = /* @__PURE__ */ new Map();
      if (!addDependencies(item, group, /* @__PURE__ */ new Set())) {
        rejected.add(key);
        continue;
      }
      const values = [...group.values()];
      const gained = new Set(values.flatMap((x) => x.capabilities).filter((x) => capabilities.includes(x) && !coverage().has(x))).size;
      if (!gained) continue;
      const report = checkCompatibility([...selected, ...values].map(candidateRecord), input.runtimeVersion);
      if (report.findings.some((x) => x.severity === "error")) {
        rejected.add(key);
        explanation.push(`${key} \u56E0\u517C\u5BB9\u6027\u6216\u4F9D\u8D56\u95EE\u9898\u88AB\u6392\u9664\u3002`);
        continue;
      }
      const penalty = new Set(values.flatMap((x) => x.permissions)).size;
      const relevance2 = Math.min(8, Math.max(...values.map((x) => x.relevance ?? 0)));
      alternatives.push({ group: values, score: gained * 100 - values.length * 10 - penalty + relevance2, key });
    }
    alternatives.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    if (!alternatives.length) break;
    for (const item of alternatives[0].group) {
      selected.push(item);
      explanation.push(`${item.name}@${item.version} \u63D0\u4F9B ${item.capabilities.join("\u3001") || "\u524D\u7F6E\u4F9D\u8D56"}\u3002`);
    }
  }
  const body = {
    schemaVersion: 1,
    id: randomUUID2(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    task: input.task,
    cwd: input.cwd,
    ...input.owner ? { owner: input.owner } : {},
    runtimeVersion: input.runtimeVersion,
    capabilities,
    selected,
    missing: capabilities.filter((x) => !coverage().has(x)),
    permissions: [...new Set(selected.flatMap((x) => x.permissions))],
    report: checkCompatibility(selected.map(candidateRecord), input.runtimeVersion),
    explanation
  };
  return { ...body, fingerprint: digest(JSON.stringify(body)) };
}
async function savePlan(root, plan) {
  await writeJson(join(root, "plans", `${plan.id}.json`), plan);
}
async function loadPlan(root, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("planId \u683C\u5F0F\u65E0\u6548");
  const plan = await readJson(join(root, "plans", `${id}.json`));
  const { fingerprint, ...body } = plan;
  if (plan.schemaVersion !== 1 || plan.id !== id || digest(JSON.stringify(body)) !== fingerprint) throw new Error("\u8BA1\u5212\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u8BA1\u5212");
  return plan;
}

// src/planning.ts
async function planTask(input) {
  const emit = (value) => {
    try {
      input.onProgress?.(value);
    } catch {
    }
  };
  emit({ message: "\u8BC6\u522B\u4EFB\u52A1\u6240\u9700\u80FD\u529B", checked: 0 });
  const catalog = await loadCatalog(input.catalog, input.signal);
  const initial = createPlan({ ...input, catalog, runtimeVersion: RUNTIME_VERSION });
  if (input.autoDiscover === false || !initial.missing.length) return initial;
  const notes = [], found = [], discovery = [];
  const inspected = /* @__PURE__ */ new Map();
  for (const capability of initial.missing.slice(0, 6)) {
    const query = searchText(capability, input.task);
    const detail = { capability, query, checked: 0, accepted: [] };
    discovery.push(detail);
    emit({ message: `\u6B63\u5728\u641C\u7D22${capabilityRules[capability]?.label ?? "\u4EFB\u52A1\u76F8\u5173"}\u63D2\u4EF6\uFF1A${query}`, capability, checked: inspected.size });
    try {
      const suggestions = (await discover(query, input.signal)).filter((x) => !x.name.startsWith("@deepseek-ai/") && relevance(capability, `${x.name} ${x.description} ${x.keywords.join(" ")}`, input.task)).slice(0, 8);
      const checked = await Promise.allSettled(suggestions.map(async (suggestion) => {
        const key = `${suggestion.name}@${suggestion.version}`;
        if (!inspected.has(key)) inspected.set(key, inspectCandidate(suggestion.name, suggestion.version, void 0, input.signal));
        const candidate = structuredClone(await inspected.get(key));
        if (!candidate.capabilities.length) {
          const evidence = `${candidate.name} ${candidate.description} ${candidate.keywords?.join(" ") ?? ""}`;
          if (!relevance(capability, evidence, input.task)) throw new Error("\u7CBE\u786E\u7248\u672C\u8BF4\u660E\u672A\u63D0\u4F9B\u8BE5\u80FD\u529B");
          candidate.capabilities = [capability];
          candidate.capabilitySource = "search";
          candidate.relevance = /theorem.proving|problem.solving|verification|literature|arxiv|科研|学术/iu.test(evidence) ? 4 : 1;
        } else if (!candidate.capabilities.includes(capability)) throw new Error("\u80FD\u529B\u58F0\u660E\u672A\u5305\u542B\u6240\u9700\u80FD\u529B");
        else candidate.relevance = 8;
        return candidate;
      }));
      input.signal?.throwIfAborted();
      detail.checked = suggestions.length;
      checked.forEach((result, index) => {
        if (result.status === "fulfilled") {
          found.push(result.value);
          detail.accepted.push(result.value.name);
        } else notes.push(`${suggestions[index].name} \u672A\u8FDB\u5165\u5019\u9009\uFF1A${String(result.reason)}`);
      });
      if (!detail.accepted.length) notes.push(`${query}\uFF1A\u6CA1\u6709\u627E\u5230\u8BF4\u660E\u4E0E\u4EFB\u52A1\u5339\u914D\u4E14\u5143\u6570\u636E\u5B8C\u6574\u7684 DSH \u63D2\u4EF6\u3002`);
    } catch (error) {
      input.signal?.throwIfAborted();
      detail.error = String(error);
      notes.push(`${query} \u5728\u7EBF\u53D1\u73B0\u5931\u8D25\uFF1A${String(error)}`);
    }
  }
  if (initial.missing.length > 6) notes.push("\u672C\u6B21\u5DF2\u641C\u7D22\u516D\u79CD\u7F3A\u5931\u80FD\u529B\uFF0C\u8BF7\u62C6\u5206\u4EFB\u52A1\u4EE5\u7EE7\u7EED\u67E5\u627E\u5269\u4F59\u80FD\u529B\u3002");
  const unique = new Map(catalog.map((x) => [`${x.name}@${x.version}`, x]));
  for (const candidate of found) {
    const key = `${candidate.name}@${candidate.version}`, existing = unique.get(key);
    if (existing?.capabilitySource === "search") existing.capabilities = [.../* @__PURE__ */ new Set([...existing.capabilities, ...candidate.capabilities])];
    else if (!existing) unique.set(key, candidate);
  }
  emit({ message: "\u68C0\u67E5\u63D2\u4EF6\u7EC4\u5408\u3001DSH \u7248\u672C\u4E0E\u4F9D\u8D56", checked: inspected.size });
  const plan = createPlan({ ...input, catalog: [...unique.values()], runtimeVersion: RUNTIME_VERSION });
  plan.discovery = discovery;
  for (const candidate of plan.selected.filter((x) => x.capabilitySource === "search")) {
    notes.push(`${candidate.name} \u7684\u80FD\u529B\u6839\u636E npm \u7CBE\u786E\u7248\u672C\u8BF4\u660E\u63A8\u65AD\uFF0C\u529F\u80FD\u5C1A\u672A\u8FD0\u884C\u9A8C\u8BC1\u3002`);
  }
  plan.explanation.push(...notes);
  const { fingerprint: _old, ...body } = plan;
  plan.fingerprint = digest(JSON.stringify(body));
  return plan;
}

// src/runner.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { mkdir as mkdir2, stat } from "node:fs/promises";
import { join as join3, resolve as resolve5 } from "node:path";
import { stringify } from "yaml";

// node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js
import { randomUUID as randomUUID4 } from "node:crypto";
import { dirname as dirname2, resolve as resolve2 } from "node:path";
import { spawn } from "node:child_process";

// node_modules/@deepseek-ai/dsh-sdk-protocol/lib/index.js
import { randomUUID as randomUUID3 } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
var JsonRpcResponseError = class extends Error {
  code;
  data;
  /**
  * @param code - the wire error code, or `undefined` when the peer sent none.
  * @param message - the wire error message.
  * @param data - the optional structured error payload, verbatim.
  */
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = "JsonRpcResponseError";
  }
};
var JsonRpcLineTransport = class {
  input;
  output;
  buffer = "";
  decoder = new StringDecoder("utf8");
  started = false;
  requestHandler;
  notificationHandler;
  pending = /* @__PURE__ */ new Map();
  constructor(input, output) {
    this.input = input;
    this.output = output;
  }
  /** Attach the input listeners and begin reading frames. Idempotent. */
  start() {
    if (this.started) return;
    this.started = true;
    this.input.on("data", this.onData);
    this.input.on("error", this.onInputError);
    this.input.on("end", this.onInputEnd);
  }
  /**
  * Detach listeners and reject pending requests. Safe before {@link start}.
  */
  close() {
    this.input.off("data", this.onData);
    this.input.off("error", this.onInputError);
    this.input.off("end", this.onInputEnd);
    this.failPending(/* @__PURE__ */ new Error("JSON-RPC transport closed"));
  }
  /**
  * Install the request handler, replacing any prior handler.
  * @param handler - resolves to the response `result`; a rejection becomes a
  * `-32603` error response carrying the message.
  */
  onRequest(handler) {
    this.requestHandler = handler;
  }
  /**
  * Install the notification handler, replacing any prior handler.
  * @param handler - invoked per notification with the method and normalized
  * params object.
  */
  onNotification(handler) {
    this.notificationHandler = handler;
  }
  /**
  * Send a request and await its response.
  * @param method - the JSON-RPC method name.
  * @param params - the request parameters object.
  * @param signal - optional abandonment signal: aborting removes the pending
  * entry (no state is retained for a response that may never come) and
  * rejects with the signal's reason.
  * @returns the result; rejects per {@link JsonRpcTransportPeer.request}.
  */
  request(method, params, signal) {
    const id = `req_${randomUUID3().replaceAll("-", "")}`;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    return new Promise((resolve7, reject) => {
      let detach = () => {
      };
      if (signal !== void 0) {
        if (signal.aborted) {
          reject(abortError(signal.reason));
          return;
        }
        const onAbort = () => {
          this.pending.delete(id);
          reject(abortError(signal.reason));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        detach = () => {
          signal.removeEventListener("abort", onAbort);
        };
      }
      this.pending.set(id, {
        resolve: (value) => {
          detach();
          resolve7(value);
        },
        reject: (error) => {
          detach();
          reject(error);
        }
      });
      try {
        this.write(message);
      } catch (error) {
        this.pending.delete(id);
        detach();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  notify(method, params) {
    this.write(params === void 0 ? {
      jsonrpc: "2.0",
      method
    } : {
      jsonrpc: "2.0",
      method,
      params
    });
  }
  /**
  * Wait for prior frame write callbacks. The empty barrier emits no bytes.
  * @returns a promise that settles with the output write callback.
  */
  flush() {
    return new Promise((resolve7, reject) => {
      this.output.write("", (error) => {
        if (error) reject(error);
        else resolve7();
      });
    });
  }
  onData = (chunk) => {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    this.drainLines();
  };
  drainLines() {
    for (; ; ) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }
  onInputError = (error) => {
    this.failPending(error);
  };
  onInputEnd = () => {
    this.buffer += this.decoder.end();
    this.drainLines();
    this.failPending(/* @__PURE__ */ new Error("JSON-RPC input closed"));
  };
  async handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    const frame = message;
    const id = frame.id;
    const method = frame.method;
    if ((typeof id === "string" || typeof id === "number") && typeof method === "string") {
      await this.handleIncomingRequest(id, method, objectParams(frame.params));
      return;
    }
    if (typeof id === "string" || typeof id === "number") {
      this.handleIncomingResponse(id, frame);
      return;
    }
    if (typeof method === "string") this.notificationHandler?.(method, objectParams(frame.params));
  }
  async handleIncomingRequest(id, method, params) {
    const handler = this.requestHandler;
    if (!handler) {
      this.writeError(id, -32601, `method not found: ${method}`);
      return;
    }
    try {
      const result = await handler(method, params);
      this.write({
        jsonrpc: "2.0",
        id,
        result
      });
    } catch (error) {
      this.writeError(id, -32603, error instanceof Error ? error.message : String(error));
    }
  }
  handleIncomingResponse(id, frame) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (frame.error && typeof frame.error === "object") {
      const error = frame.error;
      pending.reject(new JsonRpcResponseError(typeof error.code === "number" ? error.code : void 0, typeof error.message === "string" ? error.message : "JSON-RPC error", error.data));
      return;
    }
    pending.resolve(frame.result);
  }
  writeError(id, code, message) {
    this.write({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    });
  }
  write(message) {
    this.output.write(`${JSON.stringify(message)}
`);
  }
  failPending(error) {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const waiter of pending) waiter.reject(error);
  }
};
function objectParams(params) {
  return params && typeof params === "object" && !Array.isArray(params) ? params : {};
}
function abortError(reason) {
  return reason instanceof Error ? reason : /* @__PURE__ */ new Error(`JSON-RPC request aborted: ${String(reason)}`);
}

// node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
function exitsWithin(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve7) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve7(true);
    };
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve7(false);
    }, ms).unref();
    child.once("exit", onExit);
  });
}
function forceTerminateWithin(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve7, reject) => {
    let accepted = false;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const settle = (complete) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onExit = () => {
      settle(resolve7);
    };
    const onError = (error) => {
      settle(() => {
        reject(error);
      });
    };
    child.once("exit", onExit);
    child.once("error", onError);
    const timer = setTimeout(() => {
      const disposition = accepted ? "accepted" : "refused";
      settle(() => {
        reject(/* @__PURE__ */ new Error(`runtime process did not exit within ${ms}ms after SIGKILL was ${disposition}`));
      });
    }, ms).unref();
    try {
      accepted = child.kill("SIGKILL");
      if (child.exitCode !== null || child.signalCode !== null) settle(resolve7);
    } catch (error) {
      settle(() => {
        reject(new Error("SIGKILL failed", { cause: error }));
      });
    }
  });
}
async function disposeRuntimeProcess(child, graces, platform = process.platform) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.stdin?.end();
  if (await exitsWithin(child, graces.disposeEofGraceMs)) return;
  if (platform !== "win32") {
    child.kill("SIGTERM");
    if (await exitsWithin(child, graces.disposeGraceMs)) return;
  }
  await forceTerminateWithin(child, graces.disposeGraceMs);
}
function manifest(url) {
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}
function resolveDshBinFromManifests(dshManifestUrl, clientManifestUrl) {
  const dshManifest = manifest(dshManifestUrl);
  const clientManifest = manifest(clientManifestUrl);
  if (typeof dshManifest.version !== "string" || dshManifest.version !== clientManifest.version) throw new Error(`dsh SDK client ${String(clientManifest.version)} requires the same dsh version, got ${String(dshManifest.version)}`);
  const bin = typeof dshManifest.bin === "object" && dshManifest.bin !== null ? dshManifest.bin.dsh : dshManifest.bin;
  if (typeof bin !== "string" || bin === "") throw new Error("@deepseek-ai/dsh declares no dsh executable");
  return resolve2(dirname2(fileURLToPath(dshManifestUrl)), bin);
}
function resolveDshNodeLaunchFromManifests(dshManifestUrl, clientManifestUrl, sourceLoaderUrl) {
  const bin = resolveDshBinFromManifests(dshManifestUrl, clientManifestUrl);
  if (existsSync(bin)) return {
    nodeArgs: [bin],
    patches: [],
    environment: {}
  };
  const packageDir = dirname2(fileURLToPath(dshManifestUrl));
  const sourceBin = resolve2(packageDir, "src/bin.ts");
  const sourcePatch = resolve2(packageDir, "src/sdk-source.cordis.patch.yml");
  const sourceTsconfig = resolve2(packageDir, "tsconfig.json");
  if (!existsSync(sourceBin) || !existsSync(sourcePatch) || !existsSync(sourceTsconfig)) throw new Error(`@deepseek-ai/dsh is missing its built executable ${bin} and complete source launch files ${sourceBin}, ${sourcePatch}, ${sourceTsconfig}`);
  return {
    nodeArgs: [
      "--import",
      sourceLoaderUrl ?? import.meta.resolve("tsx/esm"),
      sourceBin
    ],
    patches: [sourcePatch],
    environment: { TSX_TSCONFIG_PATH: sourceTsconfig }
  };
}
function installedDshNodeLaunch() {
  return resolveDshNodeLaunchFromManifests(import.meta.resolve("@deepseek-ai/dsh/package.json"), new URL("../package.json", import.meta.url).href);
}
function resolveDshLaunch(options = {}, callerCwd = process.cwd()) {
  const profile = options.profile ?? "sdk";
  const dshLaunch = options.dshBin === void 0 ? installedDshNodeLaunch() : {
    nodeArgs: [resolve2(callerCwd, options.dshBin)],
    patches: [],
    environment: {}
  };
  const patches = [...dshLaunch.patches, ...(options.patches ?? []).map((path) => resolve2(callerCwd, path))];
  const dshHome = options.dshHome === void 0 ? void 0 : resolve2(callerCwd, options.dshHome);
  return {
    command: process.execPath,
    args: [
      ...dshLaunch.nodeArgs,
      "--profile",
      profile,
      ...patches.flatMap((path) => ["--patch", path])
    ],
    ...options.processCwd === void 0 ? {} : { cwd: resolve2(callerCwd, options.processCwd) },
    environment: () => ({
      ...options.env ?? process.env,
      ...dshLaunch.environment,
      ...dshHome === void 0 ? {} : { DSH_HOME: dshHome }
    }),
    description: `dsh profile ${JSON.stringify(profile)}`,
    initializeTimeoutMs: options.initializeTimeoutMs ?? 1e4,
    ...options.requestTimeoutMs === void 0 ? {} : { requestTimeoutMs: options.requestTimeoutMs },
    ...options.shutdownTimeoutMs === void 0 ? {} : { shutdownTimeoutMs: options.shutdownTimeoutMs },
    ...options.disposeEofGraceMs === void 0 ? {} : { disposeEofGraceMs: options.disposeEofGraceMs },
    ...options.disposeGraceMs === void 0 ? {} : { disposeGraceMs: options.disposeGraceMs }
  };
}
var STDERR_TAIL_LIMIT = 400;
var STREAM_SETTLE_MS = 100;
var TransportClosedError = class extends Error {
  /** @param message - the failure description, including any stderr tail. */
  constructor(message) {
    super(message);
    this.name = "TransportClosedError";
  }
};
var RequestTimeoutError = class extends Error {
  /** @param message - which method timed out. */
  constructor(message) {
    super(message);
    this.name = "RequestTimeoutError";
  }
};
var SdkProtocolError = class extends Error {
  /** @param message - the protocol violation description. */
  constructor(message) {
    super(message);
    this.name = "SdkProtocolError";
  }
};
var NotificationSubscriptionImpl = class {
  state;
  unsubscribe;
  constructor(state, unsubscribe) {
    this.state = state;
    this.unsubscribe = unsubscribe;
  }
  /**
  * Await the next matching notification.
  * @returns the notification; after the runtime died, drains what was
  * already delivered and then rejects; after {@link close}, rejects
  * immediately (the queue is dropped).
  */
  next() {
    const queued = this.state.queue.shift();
    if (queued !== void 0) return Promise.resolve(queued);
    if (this.state.failure !== void 0) return Promise.reject(this.state.failure);
    return new Promise((resolve7, reject) => {
      this.state.waiters.push({
        resolve: resolve7,
        reject
      });
    });
  }
  /**
  * Drain one already-delivered notification without waiting.
  * @returns the next queued notification, or `undefined` when none is queued.
  */
  tryNext() {
    return this.state.queue.shift();
  }
  /** Detach from the client; queued items drop and pending waiters reject. */
  close() {
    this.unsubscribe();
    this.state.queue.length = 0;
    this.fail(new TransportClosedError("notification subscription closed"));
  }
  /**
  * Reject pending and future waits (delivery stops; the first failure wins).
  * Already-queued notifications remain drainable via {@link next}/{@link tryNext}.
  * @param error - the terminal failure delivered to waiters.
  */
  fail(error) {
    this.state.failure ??= error;
    for (const waiter of this.state.waiters.splice(0)) waiter.reject(this.state.failure);
  }
  /**
  * Deliver one notification to a waiter or the queue when the filter
  * matches. A throwing filter fails only THIS subscription (detached, the
  * throw becomes its terminal error) — it never disturbs sibling
  * subscriptions or the transport's read loop.
  * @param notification - the wire notification to deliver.
  */
  push(notification) {
    let matches2;
    try {
      matches2 = this.state.filter === void 0 || this.state.filter(notification);
    } catch (error) {
      this.unsubscribe();
      this.fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (!matches2) return;
    const waiter = this.state.waiters.shift();
    if (waiter !== void 0) waiter.resolve(notification);
    else this.state.queue.push(notification);
  }
  /**
  * Iterate notifications until the subscription or runtime closes (the
  * terminating rejection propagates).
  * @returns an async iterator over {@link next} results.
  */
  async *[Symbol.asyncIterator]() {
    for (; ; ) yield await this.next();
  }
};
var HarnessClient = class {
  /** Original public dsh launch and timeout options for this client. */
  options;
  runtime;
  child;
  transport;
  stderrTail = [];
  subscriptions = /* @__PURE__ */ new Map();
  sessionParents = /* @__PURE__ */ new Map();
  subscriptionSerial = 0;
  exitCode;
  spawnError;
  streamsSettled = Promise.resolve();
  closeTask;
  constructor(options = {}, runtime) {
    this.options = options;
    this.runtime = runtime ?? resolveDshLaunch(options);
  }
  /**
  * Spawn the runtime subprocess and start reading frames. Idempotent while
  * the process is live; rejects reuse after {@link close}.
  */
  start() {
    if (this.closeTask !== void 0) throw new TransportClosedError("DeepSeek Harness runtime client is closed");
    if (this.child !== void 0) return;
    const child = spawn(this.runtime.command, this.runtime.args, {
      cwd: this.runtime.cwd,
      env: this.runtime.environment(),
      stdio: [
        "pipe",
        "pipe",
        "pipe"
      ]
    });
    this.child = child;
    child.once("error", (error) => {
      this.spawnError = error;
      this.transport?.close();
      this.failSubscriptions(this.closedError("DeepSeek Harness runtime failed to start"));
    });
    child.stdin.on("error", () => {
    });
    let stderrBuffer = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk;
      const newline = stderrBuffer.lastIndexOf("\n");
      if (newline >= 0) {
        this.appendStderr(stderrBuffer.slice(0, newline).split("\n"));
        stderrBuffer = stderrBuffer.slice(newline + 1);
      }
    });
    let signalStreamsSettled;
    this.streamsSettled = new Promise((resolve7) => {
      signalStreamsSettled = resolve7;
    });
    const settled = {
      stderr: false,
      exited: false
    };
    const maybeSettle = () => {
      if (settled.stderr && settled.exited) signalStreamsSettled();
    };
    child.stderr.once("close", () => {
      if (stderrBuffer.length > 0) this.appendStderr([stderrBuffer]);
      settled.stderr = true;
      maybeSettle();
    });
    child.once("exit", (code) => {
      this.exitCode = code;
      settled.exited = true;
      maybeSettle();
      this.failSubscriptions(this.closedError("DeepSeek Harness runtime exited"));
    });
    child.once("close", () => {
      this.transport?.close();
    });
    const transport = new JsonRpcLineTransport(child.stdout, child.stdin);
    transport.onNotification((method, params) => {
      this.dispatchNotification({
        method,
        params
      });
    });
    transport.start();
    this.transport = transport;
  }
  /**
  * Perform the process-wide handshake.
  * @param params - workspace cwd plus the provider/model route.
  * @returns the runtime's wire identity.
  */
  async initialize(params) {
    const result = await this.request("initialize", { ...params }, this.runtime.initializeTimeoutMs);
    if (!isRecord(result) || !isRecord(result.serverInfo) || typeof result.serverInfo.name !== "string" || typeof result.serverInfo.version !== "string") throw new SdkProtocolError(`initialize returned no server identity: ${JSON.stringify(result)}`);
    return { serverInfo: {
      name: result.serverInfo.name,
      version: result.serverInfo.version
    } };
  }
  /**
  * Queue one prompt and return its durable inbox identity.
  * @param sessionId - target session; an unknown id creates it.
  * @param contentBlocks - the user message, sent verbatim.
  * @returns the queued message id.
  */
  async prompt(sessionId, contentBlocks) {
    const params = {
      sessionId,
      contentBlocks
    };
    const result = await this.request("session/prompt", { ...params });
    if (!isRecord(result) || typeof result.messageId !== "string") throw new SdkProtocolError(`session/prompt returned no message id: ${JSON.stringify(result)}`);
    return result.messageId;
  }
  /**
  * Send one JSON-RPC request and await its result.
  * @param method - the wire method name.
  * @param params - the params object; omitted params send `{}`.
  * @param timeoutMs - per-call override of {@link HarnessClientOptions.requestTimeoutMs}.
  * @returns the raw result; rejects with {@link JsonRpcResponseError} on a
  * protocol error response, {@link RequestTimeoutError} on timeout, and
  * {@link TransportClosedError} when the runtime is gone.
  */
  async request(method, params, timeoutMs) {
    this.start();
    if (this.exitCode !== void 0 || this.spawnError !== void 0) {
      await this.settleStreams();
      throw this.closedError("DeepSeek Harness runtime is not running");
    }
    const transport = this.transport;
    if (transport === void 0) throw new TransportClosedError("DeepSeek Harness runtime is not running");
    const timeout = timeoutMs ?? this.runtime.requestTimeoutMs;
    try {
      if (timeout === void 0) return await transport.request(method, params ?? {});
      const abandon = new AbortController();
      const timer = setTimeout(() => {
        const stderr = this.stderrTail.length === 0 ? "" : `; stderr tail:
${this.stderrTail.join("\n")}`;
        abandon.abort(new RequestTimeoutError(`${method} timed out after ${timeout}ms waiting for ${this.runtime.description}${stderr}`));
      }, timeout);
      try {
        return await transport.request(method, params ?? {}, abandon.signal);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      if (error instanceof JsonRpcResponseError || error instanceof RequestTimeoutError) throw error;
      await this.settleStreams();
      throw this.closedError(errorMessage(error));
    }
  }
  /**
  * Subscribe to server notifications.
  * @param filter - optional predicate; omitted means every notification.
  * @returns the subscription handle; close it to stop delivery. After
  * {@link close} or runtime death the handle is born failed — there is no
  * producer left, so `next()` rejects instead of waiting forever.
  */
  subscribe(filter) {
    const id = String(this.subscriptionSerial++);
    const subscription = new NotificationSubscriptionImpl({
      queue: [],
      waiters: [],
      filter,
      failure: void 0
    }, () => {
      this.subscriptions.delete(id);
    });
    if (this.closeTask !== void 0 || this.exitCode !== void 0 || this.spawnError !== void 0) {
      subscription.fail(this.closedError("DeepSeek Harness runtime closed"));
      return subscription;
    }
    this.subscriptions.set(id, subscription);
    return subscription;
  }
  /**
  * Subscribe to one session and the descendants discovered from
  * `subagent.started` lineage edges. The runtime notifies for every session
  * in its context, so this client applies the scope.
  * @param sessionId - the root session id.
  * @returns the filtered subscription handle.
  */
  subscribeSessionTree(sessionId) {
    return this.subscribe((notification) => {
      const params = notification.params;
      if (notification.method === "subagent.started" || notification.method === "subagent.finished") {
        const parentId = params.parentSessionId;
        if (typeof parentId === "string" && this.isDescendantOf(parentId, sessionId)) return true;
        return params.childSessionId === sessionId;
      }
      const relatedId = params.sessionId;
      return typeof relatedId === "string" && this.isDescendantOf(relatedId, sessionId);
    });
  }
  /**
  * Shut the runtime down and reap it: a best-effort protocol `shutdown`
  * bounded by `shutdownTimeoutMs`, then the shared stdin-EOF → SIGTERM →
  * SIGKILL ladder until the process actually exited. Idempotent.
  * @returns settlement of the complete teardown.
  */
  close() {
    this.closeTask ??= this.performClose();
    return this.closeTask;
  }
  async performClose() {
    const child = this.child;
    if (child === void 0) return;
    try {
      await this.request("shutdown", void 0, this.runtime.shutdownTimeoutMs ?? 1e3);
    } catch (error) {
      this.appendStderr([`shutdown request failed: ${errorMessage(error)}`]);
    }
    await disposeRuntimeProcess(child, {
      disposeEofGraceMs: this.runtime.disposeEofGraceMs ?? 6e3,
      disposeGraceMs: this.runtime.disposeGraceMs ?? 3e3
    });
    this.transport?.close();
    this.failSubscriptions(this.closedError("DeepSeek Harness runtime closed"));
  }
  dispatchNotification(notification) {
    this.recordSessionRelationship(notification);
    for (const subscription of this.subscriptions.values()) subscription.push(notification);
  }
  recordSessionRelationship(notification) {
    if (notification.method !== "subagent.started") return;
    const parentId = notification.params.parentSessionId;
    const childId = notification.params.childSessionId;
    if (typeof parentId === "string" && parentId !== "" && typeof childId === "string" && childId !== "" && parentId !== childId) this.sessionParents.set(childId, parentId);
  }
  isDescendantOf(sessionId, rootSessionId) {
    const visited = /* @__PURE__ */ new Set();
    let current = sessionId;
    while (!visited.has(current)) {
      if (current === rootSessionId) return true;
      visited.add(current);
      const parent = this.sessionParents.get(current);
      if (parent === void 0) return false;
      current = parent;
    }
    return false;
  }
  failSubscriptions(error) {
    for (const subscription of this.subscriptions.values()) subscription.fail(error);
  }
  appendStderr(lines) {
    const kept = lines.filter((line) => line.length > 0);
    this.stderrTail.push(...kept);
    if (this.stderrTail.length > STDERR_TAIL_LIMIT) this.stderrTail.splice(0, this.stderrTail.length - STDERR_TAIL_LIMIT);
  }
  settleStreams() {
    return Promise.race([this.streamsSettled, new Promise((resolve7) => {
      setTimeout(resolve7, STREAM_SETTLE_MS);
    })]);
  }
  closedError(reason) {
    const parts = [`${this.runtime.description}: ${reason}`];
    if (this.spawnError !== void 0) parts.push(`spawn error: ${this.spawnError.message}`);
    if (this.exitCode !== void 0) parts.push(`exit code: ${String(this.exitCode)}`);
    if (this.stderrTail.length > 0) parts.push(`stderr tail:
${this.stderrTail.join("\n")}`);
    return new TransportClosedError(parts.join("\n"));
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
var DeepSeekHarness = class {
  clientInstance;
  createClient;
  cwd;
  provider;
  model;
  reasoningEffort;
  maxTokens;
  initialized;
  closed = false;
  constructor(options = {}, clientFactory) {
    this.createClient = clientFactory ?? (() => new HarnessClient(options));
    this.clientInstance = this.createClient();
    this.cwd = resolve2(options.cwd ?? options.processCwd ?? process.cwd());
    this.provider = options.provider ?? "deepseek-official";
    this.model = options.model ?? "deepseek-v4-flash";
    this.reasoningEffort = options.reasoningEffort;
    this.maxTokens = options.maxTokens;
  }
  /**
  * The underlying JSON-RPC client (exposed for low-level access). A failed
  * handshake swaps in a fresh instance only after cleanup proves the runtime
  * exited; cleanup failure retains this client, so do not cache it across a
  * failed {@link start}.
  * @returns the client currently owning the runtime subprocess.
  */
  get client() {
    return this.clientInstance;
  }
  /**
  * Start the subprocess and perform the `initialize` handshake once. On
  * failure, successful SDK-owned cleanup reaps the runtime and installs a
  * fresh client (`HarnessClient.close` is permanent), so a later call retries
  * with a new subprocess unless {@link close} already ended this harness. If
  * cleanup also fails, rejects with an `AggregateError` whose ordered errors
  * preserve both causes and retains the failed client rather than spawning
  * alongside a process whose exit was not proved.
  * @returns settlement of the (memoized) handshake.
  */
  start() {
    this.initialized ??= (async () => {
      try {
        this.clientInstance.start();
        await this.clientInstance.initialize({
          cwd: this.cwd,
          provider: this.provider,
          model: this.model,
          ...this.reasoningEffort === void 0 ? {} : { reasoningEffort: this.reasoningEffort },
          ...this.maxTokens === void 0 ? {} : { maxTokens: this.maxTokens }
        });
      } catch (error) {
        this.initialized = void 0;
        try {
          await this.clientInstance.close();
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "DeepSeek Harness initialization and cleanup failed");
        }
        if (!this.closed) this.clientInstance = this.createClient();
        throw error;
      }
    })();
    return this.initialized;
  }
  /**
  * Open a session handle (no wire traffic; the runtime creates the session
  * on its first prompt).
  * @param sessionId - explicit id to reuse; omitted mints a fresh one.
  * @returns the session handle.
  */
  session(sessionId) {
    return new HarnessSession(this, sessionId ?? `session-${randomUUID4().replaceAll("-", "")}`);
  }
  /**
  * Run one prompt on a fresh (or named) session.
  * @param input - prompt text, or content blocks sent verbatim.
  * @param options - optional session id and per-notification observer.
  * @returns the owned activity interval.
  */
  run(input, options) {
    return this.session(options?.sessionId).run(input, options);
  }
  /**
  * Shut down and reap the runtime subprocess. Idempotent and terminal —
  * a closed harness no longer retries a failed handshake.
  * @returns settlement of the complete teardown.
  */
  close() {
    this.closed = true;
    return this.clientInstance.close();
  }
  /**
  * `await using` support: {@link close}.
  * @returns settlement of the teardown.
  */
  [Symbol.asyncDispose]() {
    return this.close();
  }
};
var HarnessSession = class {
  harness;
  id;
  /**
  * @param harness - the owning harness (supplies the client and handshake).
  * @param id - the wire session id this handle runs on.
  */
  constructor(harness, id) {
    this.harness = harness;
    this.id = id;
  }
  /**
  * Queue one prompt, then observe the whole session through its next idle.
  * @param input - prompt text, or content blocks sent verbatim.
  * @param options - optional per-notification observer.
  * @returns the owned activity interval; rejects on transport loss, timeout,
  * or a protocol error.
  */
  async run(input, options) {
    await this.harness.start();
    const client = this.harness.client;
    const contentBlocks = normalizeInput(input);
    const events = [];
    const notifications = [];
    const subscription = client.subscribeSessionTree(this.id);
    const collect = (notification) => {
      if (notification.method === "session.event" && notification.params.sessionId === this.id) {
        const event = validatedSessionEvent(notification.params.event);
        notifications.push(notification);
        options?.onNotification?.(notification);
        events.push(event);
        return;
      }
      notifications.push(notification);
      options?.onNotification?.(notification);
    };
    try {
      const messageId = await client.prompt(this.id, contentBlocks);
      let received = false;
      while (true) {
        const notification = await subscription.next();
        if (!received) {
          if (notification.method !== "session.event" || notification.params.sessionId !== this.id || !isInboxReceipt(notification.params.event, messageId)) continue;
          received = true;
        }
        collect(notification);
        if (notification.method === "session.status" && notification.params.sessionId === this.id && notification.params.status === "idle") break;
      }
    } finally {
      subscription.close();
    }
    return {
      sessionId: this.id,
      finalResponse: finalResponse(events),
      events,
      notifications
    };
  }
};
function normalizeInput(input) {
  return typeof input === "string" ? [{
    type: "text",
    text: input
  }] : input;
}
function validatedTurnEndReason(value) {
  if (!isRecord(value) || typeof value.kind !== "string") throw new SdkProtocolError(`turn/end carried no reason envelope: ${JSON.stringify(value)}`);
  if (value.kind === "aborted") {
    if (!isRecord(value.reason) || typeof value.reason.kind !== "string") throw new SdkProtocolError(`turn/end carried a malformed aborted reason: ${JSON.stringify(value)}`);
    switch (value.reason.kind) {
      case "user":
      case "parent":
      case "disposed":
      case "legacy":
        break;
      case "hook":
        if (typeof value.reason.reason !== "string") throw new SdkProtocolError(`turn/end carried a malformed hook abort reason: ${JSON.stringify(value)}`);
        break;
      default:
        throw new SdkProtocolError(`turn/end carried an unknown abort reason: ${JSON.stringify(value)}`);
    }
  }
  return value;
}
function validatedSessionEvent(value) {
  if (!isRecord(value) || typeof value.type !== "string") throw new SdkProtocolError(`session.event carried no event envelope: ${JSON.stringify(value)}`);
  if (value.type === "assistant/message") {
    const message = isRecord(value.data) ? value.data.message : void 0;
    const content = isRecord(message) ? message.content : void 0;
    if (!Array.isArray(content) || !content.every((block) => isRecord(block) && typeof block.type === "string")) throw new SdkProtocolError(`assistant/message event carried malformed content: ${JSON.stringify(value)}`);
  }
  if (value.type === "turn/end") {
    const data = isRecord(value.data) ? value.data : void 0;
    if (data === void 0) throw new SdkProtocolError(`turn/end event carried malformed data: ${JSON.stringify(value)}`);
    validatedTurnEndReason(data.reason);
  }
  return value;
}
function isInboxReceipt(value, messageId) {
  if (!isRecord(value) || value.type !== "agent/inbox/spliced" || !isRecord(value.data)) return false;
  const inserted = value.data.inserted;
  return Array.isArray(inserted) && inserted.some((message) => isRecord(message) && message.id === messageId);
}
function finalResponse(events) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type !== "assistant/message") continue;
    return event.data.message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  }
  return "";
}

// shared/process.ts
import { spawn as spawn2, execFile } from "node:child_process";
import { promisify } from "node:util";
var exec = promisify(execFile);
async function stopTree(pid) {
  if (process.platform === "win32") {
    try {
      await exec("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    } catch (error) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      throw error;
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
function childEnvironment(keys = [], parent = process.env) {
  const system = [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "LANG",
    "LC_ALL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY"
  ];
  const env = {};
  for (const key of [...system, ...keys]) {
    if (/^(NODE_OPTIONS|NODE_PATH|LD_|DYLD_|BASH_ENV|ENV$|DSH_)/.test(key)) throw new Error(`\u4E0D\u5141\u8BB8\u8F6C\u53D1\u8FD0\u884C\u65F6\u6CE8\u5165\u53D8\u91CF\uFF1A${key}`);
    if (parent[key] !== void 0) env[key] = parent[key];
  }
  return { ...env, DSH_TELEMETRY_DISABLED: "1" };
}
async function runProcess(command, args, options) {
  options.signal?.throwIfAborted();
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 18e4)]) : AbortSignal.timeout(options.timeoutMs ?? 18e4);
  return new Promise((resolve7, reject) => {
    const child = spawn2(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "", stop;
    const collect = (chunk) => {
      output = (output + chunk.toString("utf8")).slice(-128e3);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const abort = () => {
      if (child.pid) stop ??= stopTree(child.pid);
      stop?.catch(() => {
      });
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.once("error", (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    child.once("close", async (code) => {
      signal.removeEventListener("abort", abort);
      try {
        await stop;
        signal.throwIfAborted();
        if (code !== 0) throw new Error(`\u8FDB\u7A0B\u9000\u51FA\u7801 ${code}: ${output}`);
        resolve7({ code, output });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// shared/profile.ts
import { readFile as readFile2, realpath as realpath2 } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname as dirname3, join as join2, resolve as resolve3 } from "node:path";
import { parseDocument } from "yaml";

// shared/types.ts
var protectedNames = /* @__PURE__ */ new Set(["dsh-compat-guardian", "dsh-autocompose"]);
function isProtected(name) {
  return name.startsWith("@deepseek-ai/") || protectedNames.has(name);
}

// shared/profile.ts
async function locateManifest(name, anchors) {
  packageName(name);
  for (const anchor of anchors) {
    const require2 = createRequire(resolve3(anchor));
    for (const searchPath of require2.resolve.paths(name) ?? []) {
      const direct = join2(searchPath, ...name.split("/"), "package.json");
      const raw = await optionalText(direct);
      if (raw !== void 0) {
        const manifest2 = object(JSON.parse(raw), direct);
        if (manifest2.name !== name) throw new Error(`\u5305\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF1A\u9700\u8981 ${name}\uFF0C\u5B9E\u9645 ${manifest2.name}`);
        return { manifest: manifest2, directory: dirname3(await realpath2(direct)) };
      }
    }
    let entry;
    try {
      entry = require2.resolve(`${name}/package.json`);
    } catch {
      try {
        entry = require2.resolve(name);
      } catch {
        continue;
      }
    }
    let dir = dirname3(entry);
    for (; ; ) {
      const text = await optionalText(join2(dir, "package.json"));
      if (text) {
        const manifest2 = object(JSON.parse(text), "package.json");
        if (manifest2.name === name) return { manifest: manifest2, directory: await realpath2(dir) };
      }
      if (dirname3(dir) === dir) break;
      dir = dirname3(dir);
    }
  }
  throw new Error(`\u627E\u4E0D\u5230\u5DF2\u5B89\u88C5\u7684 ${name}\uFF0C\u672A\u5BFC\u5165\u63D2\u4EF6\u4EE3\u7801`);
}
async function declaredRows(directory, manifest2) {
  const patch = manifest2.dsh?.bundle?.patch;
  if (!patch) return { rowIds: [], duplicateRowIds: [] };
  const files = typeof patch === "string" ? [patch] : patch;
  if (!Array.isArray(files) || files.some((x) => typeof x !== "string")) throw new Error("bundle.patch \u683C\u5F0F\u65E0\u6548");
  const rowIds = [], duplicates = /* @__PURE__ */ new Set();
  for (const file of files) {
    const path = within(directory, resolve3(directory, file));
    within(await realpath2(directory), await realpath2(path));
    const document = parseDocument(await readFile2(path, "utf8"), { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (text) => text }] });
    if (document.errors.length) throw new Error(`\u65E0\u6CD5\u89E3\u6790 ${file}: ${document.errors[0].message}`);
    const patches = document.toJS({ maxAliasCount: 100 });
    if (!Array.isArray(patches)) throw new Error("bundle patch \u5FC5\u987B\u662F\u6570\u7EC4");
    for (const patch2 of patches) {
      if (!patch2 || typeof patch2 !== "object" || !Array.isArray(patch2.insert)) continue;
      for (const row of patch2.insert) {
        if (typeof row?.id !== "string" || typeof row?.name !== "string") continue;
        if (rowIds.includes(row.id)) duplicates.add(row.id);
        else rowIds.push(row.id);
      }
    }
  }
  return { rowIds, duplicateRowIds: [...duplicates] };
}
async function checkClientArtifact(directory, manifest2) {
  const dsh = manifest2.dsh;
  if (dsh?.client?.platform !== "web") return;
  const exported = manifest2.exports?.["./client"];
  const client = typeof exported === "string" ? exported : exported && typeof exported === "object" ? exported.default : void 0;
  if (typeof client !== "string" || !client.startsWith("./")) throw new Error(`${manifest2.name} \u7F3A\u5C11\u53EF\u7528\u7684 ./client \u5BFC\u51FA`);
  const file = within(directory, resolve3(directory, client));
  within(await realpath2(directory), await realpath2(file));
}
async function scanProfile(directory, installAnchor) {
  const profilePath = join2(directory, "package.json");
  const manifest2 = object(JSON.parse(await readFile2(profilePath, "utf8")), "profile package.json");
  const selected = manifest2.dsh?.profile?.bundles;
  if (!Array.isArray(selected) || selected.some((x) => typeof x !== "string")) throw new Error("\u76EE\u6807\u76EE\u5F55\u6CA1\u6709\u6709\u6548\u7684 dsh.profile.bundles");
  const names = [.../* @__PURE__ */ new Set([...selected, ...Object.keys(manifest2.dependencies ?? {})])];
  const records = [];
  for (const name of names) {
    const base = { name, enabled: selected.includes(name), protected: isProtected(name), removable: Object.hasOwn(manifest2.dependencies ?? {}, name) && !isProtected(name) };
    try {
      const { manifest: installed, directory: packageDir } = await locateManifest(name, [...installAnchor ? [installAnchor] : [], profilePath]);
      if (!installed.dsh?.bundle && !base.enabled) continue;
      let rows = { rowIds: [], duplicateRowIds: [] };
      let loadError;
      try {
        rows = await declaredRows(packageDir, installed);
        await checkClientArtifact(packageDir, installed);
      } catch (error) {
        loadError = String(error);
      }
      if (!installed.dsh?.bundle) loadError = `${name} \u672A\u58F0\u660E dsh.bundle`;
      records.push({
        ...base,
        version: installed.version ?? "unknown",
        manifest: installed,
        directory: packageDir,
        ...rows,
        ...loadError ? { loadError } : {}
      });
    } catch (error) {
      records.push({ ...base, version: "unknown", manifest: {}, rowIds: [], loadError: String(error) });
    }
  }
  return records;
}

// src/runtime.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { createRequire as createRequire2 } from "node:module";
import { dirname as dirname4, resolve as resolve4 } from "node:path";
function resolveRuntime(installAnchor = import.meta.url) {
  const require2 = createRequire2(installAnchor);
  let manifest2;
  try {
    manifest2 = require2.resolve("@deepseek-ai/dsh/package.json");
  } catch {
    throw new Error(`\u672A\u627E\u5230 DSH ${RUNTIME_VERSION}\u3002\u8BF7\u5728 DSH \u4E2D\u8FD0\u884C\uFF1B\u72EC\u7ACB CLI \u53EF\u7528 --install-anchor \u6307\u5B9A\u73B0\u6709 DSH \u5B89\u88C5\u4E2D\u7684 package.json\u3002`);
  }
  const pkg = JSON.parse(readFileSync2(manifest2, "utf8"));
  if (pkg.name !== "@deepseek-ai/dsh" || pkg.version !== RUNTIME_VERSION) {
    throw new Error(`\u672C\u7248\u6267\u884C\u5668\u9700\u8981 DSH ${RUNTIME_VERSION}\uFF0C\u73B0\u6709\u5B89\u88C5\u4E3A ${String(pkg.version)}\u3002`);
  }
  const executable = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.dsh;
  if (typeof executable !== "string") throw new Error("\u73B0\u6709 DSH \u5B89\u88C5\u672A\u58F0\u660E CLI \u5165\u53E3\u3002");
  const bin = resolve4(dirname4(manifest2), executable);
  if (!existsSync2(bin)) throw new Error("\u73B0\u6709 DSH \u5B89\u88C5\u7F3A\u5C11\u7F16\u8BD1\u540E\u7684 CLI \u5165\u53E3\u3002");
  return { bin, manifest: manifest2 };
}

// src/runner.ts
var activeRuns = /* @__PURE__ */ new Set();
async function runPlan(plan, options) {
  const { fingerprint, ...body } = plan;
  if (digest(JSON.stringify(body)) !== fingerprint) throw new Error("\u8BA1\u5212\u5185\u5BB9\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210");
  const timeoutMs = options.timeoutMs ?? 6e5;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1e3 || timeoutMs > 72e5) throw new Error("timeoutMs \u5FC5\u987B\u4ECB\u4E8E 1000 \u548C 7200000");
  if (plan.missing.length) throw new Error(`\u7F3A\u5C11\u80FD\u529B\uFF1A${plan.missing.join("\u3001")}\u3002\u8BF7\u6DFB\u52A0\u5019\u9009\u63D2\u4EF6\u6216\u8C03\u6574\u80FD\u529B\u5217\u8868\u3002`);
  if (plan.report.findings.some((x) => x.severity === "error")) throw new Error("\u7EC4\u5408\u5B58\u5728\u517C\u5BB9\u6027\u9519\u8BEF");
  if (plan.runtimeVersion !== RUNTIME_VERSION) throw new Error(`\u672C\u7248\u6267\u884C\u5668\u4F7F\u7528 DSH ${RUNTIME_VERSION}\uFF0C\u8BF7\u636E\u6B64\u91CD\u65B0\u89C4\u5212`);
  if (!(await stat(plan.cwd)).isDirectory()) throw new Error("\u4EFB\u52A1\u5DE5\u4F5C\u76EE\u5F55\u4E0D\u5B58\u5728");
  const root = resolve5(options.root), runs = join3(root, "runs");
  await mkdir2(runs, { recursive: true });
  return withLock(join3(root, `run-${plan.id}.lock`), async () => {
    options.signal?.throwIfAborted();
    const id = randomUUID5(), directory = join3(runs, id), home = join3(directory, "home");
    await mkdir2(home, { recursive: true });
    await writeJson(join3(directory, ".autocompose-owner.json"), { id, pid: process.pid });
    const evidence = {
      id,
      planId: plan.id,
      fingerprint: plan.fingerprint,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      processId: process.pid,
      status: "running",
      runtimeVersion: RUNTIME_VERSION,
      packages: plan.selected.map((x) => ({ name: x.name, version: x.version })),
      cleanup: "pending",
      directory
    };
    evidence.task = plan.task;
    evidence.mode = options.mode ?? "read-only";
    const evidencePath = join3(root, "history", `${id}.json`);
    const progress = async (stage, currentPackage) => {
      evidence.stage = stage;
      if (currentPackage) evidence.currentPackage = currentPackage;
      else delete evidence.currentPackage;
      await writeJson(evidencePath, evidence);
      try {
        options.onProgress?.(structuredClone(evidence));
      } catch {
      }
    };
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let harness;
    let closeFailed = false;
    activeRuns.add(id);
    try {
      await progress("preparing");
      const runtime = resolveRuntime(options.installAnchor);
      const env = {
        ...childEnvironment(options.envKeys ?? ["DEEPSEEK_API_KEY"]),
        DSH_HOME: home,
        ...process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}
      };
      await runProcess(process.execPath, [runtime.bin, "--profile", "sdk", "--dump-config"], { cwd: directory, env, signal });
      for (const candidate of plan.selected.filter((x) => x.source === "npm")) {
        await progress("installing", candidate.name);
        const current = await inspectCandidate(candidate.name, candidate.version, candidate.capabilities, signal);
        if (current.integrity !== candidate.integrity || current.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} \u7684\u5143\u6570\u636E\u6216\u5236\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u89C4\u5212`);
        await runProcess(process.execPath, [
          runtime.bin,
          "plugin",
          "--profile",
          "sdk",
          "add",
          `${candidate.name}@${candidate.version}`,
          "--save-exact",
          "--ignore-scripts",
          "--registry=https://registry.npmjs.org"
        ], { cwd: directory, env, signal });
      }
      await progress("checking");
      const installed = await scanProfile(join3(home, "profiles", "sdk"), runtime.manifest);
      const report = checkCompatibility(installed, RUNTIME_VERSION);
      const failures = report.findings.filter((x) => x.severity === "error");
      if (failures.length) throw new Error(`\u5B9E\u9645\u5B89\u88C5\u540E\u68C0\u67E5\u5931\u8D25\uFF1A${failures.map((x) => x.message).join("; ")}`);
      const patch = join3(directory, "execution.patch.yml");
      await atomicWrite(patch, stringify([
        { id: "sandbox-policy", config: { mode: options.mode ?? "read-only", workspaceRoot: plan.cwd } },
        { id: "tool-plugin-manager", disabled: true }
      ]));
      harness = new DeepSeekHarness({
        dshBin: runtime.bin,
        profile: "sdk",
        dshHome: home,
        cwd: plan.cwd,
        processCwd: directory,
        env,
        patches: [patch],
        provider: options.provider ?? "deepseek-official",
        model: options.model ?? "deepseek-v4-flash",
        initializeTimeoutMs: 3e4,
        requestTimeoutMs: timeoutMs
      });
      const runningHarness = harness;
      let abortClose;
      const abort = () => {
        abortClose ??= runningHarness.close();
        abortClose.catch(() => {
        });
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        signal.throwIfAborted();
        await progress("executing");
        const result = await harness.run(plan.task);
        signal.throwIfAborted();
        if (!result.finalResponse.trim()) throw new Error("\u5B50\u8FD0\u884C\u65F6\u7ED3\u675F\u4F46\u672A\u7ED9\u51FA\u6700\u7EC8\u56DE\u590D\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u51ED\u636E\u4E0E\u4E8B\u4EF6\u8BB0\u5F55");
        Object.assign(evidence, { status: "completed", sessionId: result.sessionId, finalResponse: result.finalResponse, events: result.events.length });
      } finally {
        signal.removeEventListener("abort", abort);
        if (abortClose) await abortClose;
      }
    } catch (error) {
      evidence.status = options.signal?.aborted ? "cancelled" : "failed";
      evidence.error = options.signal?.aborted ? "\u4EFB\u52A1\u5DF2\u53D6\u6D88" : error instanceof Error ? error.message : String(error);
    } finally {
      try {
        await progress("cleaning");
      } catch {
      }
      if (harness) {
        try {
          await harness.close();
        } catch (error) {
          closeFailed = true;
          evidence.status = "failed";
          evidence.error = `${evidence.error ?? ""}
\u5173\u95ED\u5B50\u8FD0\u884C\u65F6\u5931\u8D25\uFF1A${String(error)}`;
        }
      }
      evidence.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (options.keep || closeFailed) evidence.cleanup = "kept";
      else {
        try {
          await removeOwnedRun(runs, directory, id);
          evidence.cleanup = "removed";
        } catch (error) {
          evidence.cleanup = "failed";
          evidence.error = `${evidence.error ?? ""}
\u6E05\u7406\u5931\u8D25\uFF1A${String(error)}`;
        }
      }
      try {
        await progress("finished");
      } finally {
        activeRuns.delete(id);
      }
    }
    return evidence;
  });
}
async function savePreset(root, name, plan) {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name)) throw new Error("\u9884\u8BBE\u540D\u79F0\u53EA\u5141\u8BB8\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u77ED\u6A2A\u7EBF\u548C\u4E0B\u5212\u7EBF");
  const path = join3(root, "presets", `${name}.json`);
  await writeJson(path, { schemaVersion: 1, name, savedAt: (/* @__PURE__ */ new Date()).toISOString(), plan });
  return path;
}
async function loadPreset(root, name, task) {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name)) throw new Error("\u9884\u8BBE\u540D\u79F0\u65E0\u6548");
  const saved = await readJson(join3(root, "presets", `${name}.json`));
  const { fingerprint: previous, ...old } = saved.plan;
  if (digest(JSON.stringify(old)) !== previous) throw new Error("\u9884\u8BBE\u5185\u5BB9\u5DF2\u53D8\u5316");
  return createPlan({
    task: task ?? old.task,
    cwd: old.cwd,
    runtimeVersion: RUNTIME_VERSION,
    catalog: old.selected,
    owner: old.owner,
    ...task === void 0 ? { capabilities: old.capabilities } : {}
  });
}

// src/cli.ts
var help = `dsh-autocompose ${createRequire3(import.meta.url)("../package.json").version}
  plan --task "\u8BFB\u53D6 PDF \u5E76\u68C0\u7D22\u6587\u6863" [--catalog catalog.json] [--capabilities pdf,web]
  discover --capability pdf
  run --id <planId> --yes [--mode read-only|workspace-write]
  save-preset --id <planId> --preset <name>
  use-preset --preset <name> [--task "\u65B0\u4EFB\u52A1"] --yes

\u901A\u7528\uFF1A--root <\u72B6\u6001\u76EE\u5F55> --cwd <\u4EFB\u52A1\u76EE\u5F55> --no-discovery\uFF08\u4E0D\u8865\u5145\u641C\u7D22\uFF09
\u8FD0\u884C\uFF1A--provider <route> --model <id> --timeout <\u6BEB\u79D2> --keep --install-anchor <DSH\u5B89\u88C5\u4E2D\u7684package.json>
\u9ED8\u8BA4\u53EA\u8BFB\uFF1B\u72EC\u7ACB\u914D\u7F6E\u76EE\u5F55\u4E0D\u662F\u64CD\u4F5C\u7CFB\u7EDF\u6C99\u7BB1\u3002\u6267\u884C\u9700\u8981\u5DF2\u6709 DSH 0.2.0-rc.2\u3001pnpm \u548C\u6A21\u578B\u51ED\u636E\u3002
\u53EA\u6709 run/use-preset \u4F1A\u542F\u52A8\u6A21\u578B\uFF0C--yes \u8868\u793A\u786E\u8BA4\u8BA1\u5212\u4E2D\u7684\u5B89\u88C5\u3001\u8FDB\u7A0B\u3001\u7F51\u7EDC\u4E0E\u76EE\u5F55\u6743\u9650\u3002`;
async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: {
    task: { type: "string" },
    catalog: { type: "string" },
    capabilities: { type: "string" },
    capability: { type: "string" },
    root: { type: "string" },
    cwd: { type: "string" },
    id: { type: "string" },
    preset: { type: "string" },
    provider: { type: "string" },
    model: { type: "string" },
    timeout: { type: "string" },
    "install-anchor": { type: "string" },
    mode: { type: "string" },
    yes: { type: "boolean" },
    keep: { type: "boolean" },
    "no-discovery": { type: "boolean" },
    help: { type: "boolean", short: "h" }
  } });
  const command = positionals[0];
  if (!command || args.help) {
    console.log(help);
    return;
  }
  const root = resolve6(args.root ?? ".dsh-autocompose");
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error("\u7528\u6237\u53D6\u6D88"));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    let output;
    if (command === "discover") output = await discover(args.capability ?? "", controller.signal);
    else if (command === "plan") {
      const plan = await planTask({
        task: args.task ?? "",
        cwd: resolve6(args.cwd ?? process.cwd()),
        catalog: args.catalog,
        signal: controller.signal,
        autoDiscover: !args["no-discovery"],
        capabilities: args.capabilities?.split(",").map((x) => x.trim()).filter(Boolean)
      });
      await savePlan(root, plan);
      output = plan;
    } else if (command === "save-preset") output = { path: await savePreset(root, args.preset ?? "", await loadPlan(root, args.id ?? "")) };
    else if (command === "run" || command === "use-preset") {
      if (!args.yes) throw new Error("\u8BF7\u5148\u67E5\u770B\u8BA1\u5212\uFF0C\u518D\u52A0 --yes \u6267\u884C");
      if (args.mode && !["read-only", "workspace-write"].includes(args.mode)) throw new Error("mode \u5FC5\u987B\u662F read-only \u6216 workspace-write");
      const plan = command === "run" ? await loadPlan(root, args.id ?? "") : await loadPreset(root, args.preset ?? "", args.task);
      const result = await runPlan(plan, {
        root,
        installAnchor: args["install-anchor"] ? resolve6(args["install-anchor"]) : void 0,
        provider: args.provider,
        model: args.model,
        timeoutMs: args.timeout ? Number(args.timeout) : void 0,
        keep: args.keep,
        mode: args.mode,
        signal: controller.signal
      });
      output = result;
      if (result.status !== "completed" || result.cleanup === "failed") process.exitCode = 1;
    } else throw new Error(`\u672A\u77E5\u547D\u4EE4\uFF1A${command}`);
    console.log(JSON.stringify(output, null, 2));
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map
