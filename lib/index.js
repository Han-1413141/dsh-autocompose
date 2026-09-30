var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key2 = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key2] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key2] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/index.ts
import { homedir } from "node:os";
import { join as join5, resolve as resolve5 } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";

// shared/approval.ts
import { approveEscalation } from "@deepseek-ai/dsh-sandbox";
async function approve(ctx, exec2, subject, justification) {
  const policy = ctx.sandboxPolicy.resolve(exec2.agent ? { session: exec2.agent.session } : {});
  await approveEscalation(
    { requestedMode: "danger-full-access", effectiveMode: policy.mode, subject, justification },
    { approver: ctx.get("approval"), agent: exec2.agent, callId: exec2.callId, toolName: exec2.name, signal: exec2.signal }
  );
  exec2.signal.throwIfAborted();
}

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
    await rename(temporary, path);
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
  for (const key2 of ["capabilities", "services", "tools", "permissions", "platforms"]) {
    if (data[key2] !== void 0) out[key2] = strings(data[key2], `dshCompat.${key2}`);
  }
  if (data.dsh !== void 0) {
    out.dsh = string(data.dsh, "dshCompat.dsh");
    if (!semver.validRange(out.dsh)) throw new Error("dshCompat.dsh \u7248\u672C\u8303\u56F4\u65E0\u6548");
  }
  for (const key2 of ["requires", "conflicts"]) {
    if (data[key2] === void 0) continue;
    out[key2] = {};
    for (const [name2, range] of Object.entries(object(data[key2], key2))) {
      packageName(name2);
      const rule = string(range, `${key2}.${name2}`);
      if (!semver.validRange(rule)) throw new Error(`${key2}.${name2} \u7248\u672C\u8303\u56F4\u65E0\u6548`);
      out[key2][name2] = rule;
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
async function inspectCandidate(name2, exactVersion, capabilities, signal) {
  packageName(name2);
  version(exactVersion);
  const data = await registryJson(`${encodeURIComponent(name2)}/${encodeURIComponent(exactVersion)}`, signal);
  if (data.name !== name2 || data.version !== exactVersion) throw new Error("npm \u5305\u8EAB\u4EFD\u4E0E\u8BF7\u6C42\u4E0D\u4E00\u81F4");
  if (!data.dsh?.bundle?.patch) throw new Error(`${name2} \u672A\u58F0\u660E DSH bundle`);
  const meta = compatMetadata(data.dshCompat);
  const dist = object(data.dist, "npm dist");
  const integrity = string(dist.integrity, "dist.integrity");
  const manifest = {
    name: name2,
    version: exactVersion,
    description: data.description,
    dsh: data.dsh,
    dependencies: data.dependencies,
    peerDependencies: data.peerDependencies,
    peerDependenciesMeta: data.peerDependenciesMeta,
    engines: data.engines,
    os: data.os,
    dshCompat: data.dshCompat
  };
  return {
    name: name2,
    version: exactVersion,
    capabilities: capabilities ?? meta.capabilities ?? [],
    permissions: meta.permissions ?? ["host-code: filesystem, network, processes"],
    description: data.description ?? name2,
    source: "npm",
    manifest,
    integrity,
    capabilitySource: capabilities ? "catalog" : "manifest",
    metadataHash: digest(JSON.stringify(manifest))
  };
}
async function discover(capability, signal) {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(capability)) throw new Error("\u80FD\u529B\u540D\u79F0\u987B\u4E3A\u82F1\u6587\u5355\u8BCD\u6216\u77ED\u6A2A\u7EBF\u7EC4\u5408");
  const result = await registryJson(`-/v1/search?text=${encodeURIComponent(`keywords:dsh-plugin ${capability}`)}&size=12`, signal);
  if (!Array.isArray(result.objects)) return [];
  return result.objects.map((item) => {
    const pkg = object(object(item, "search item").package, "package");
    return {
      name: string(pkg.name, "name"),
      version: string(pkg.version, "version"),
      description: typeof pkg.description === "string" ? pkg.description : "",
      links: pkg.links,
      status: "\u641C\u7D22\u5EFA\u8BAE\uFF1B\u9700\u6838\u9A8C\u5143\u6570\u636E\u548C\u5B89\u88C5\u8BA1\u5212"
    };
  });
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
          for (const [name2, range] of Object.entries(object(plugin.manifest[field], field))) string(range, `${field}.${name2}`);
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
    const dshPeers = Object.entries(peers).filter(([name2]) => name2 === "@deepseek-ai/dsh" || name2.startsWith("@deepseek-ai/dsh-"));
    const ranges = [...dshPeers, ...meta.dsh ? [["dshCompat.dsh", meta.dsh]] : []];
    if (!ranges.length && !plugin.protected) add("unknown-compatibility", [plugin.name], `${plugin.name} \u672A\u58F0\u660E DSH \u7248\u672C\u8303\u56F4\uFF1B\u517C\u5BB9\u6027\u672A\u77E5`, "warning");
    for (const [name2, range] of options.runtimeCompanions?.has(plugin.name) ? [] : ranges) {
      const normalized = typeof range === "string" && ["workspace:*", "workspace:^", "workspace:~"].includes(range) ? runtime : range;
      if (typeof normalized !== "string" || !matches(runtime, normalized)) {
        add("dsh-version", [plugin.name], `${plugin.name}@${plugin.version} \u8981\u6C42 ${name2} ${String(range)}\uFF0C\u5F53\u524D DSH \u4E3A ${runtime}`);
      }
    }
    const sharedRuntime = /* @__PURE__ */ new Set(["@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-sandbox-policy"]);
    for (const [name2, range] of Object.entries(plugin.manifest.dependencies ?? {})) {
      if (!options.runtimeCompanions?.has(plugin.name) && sharedRuntime.has(name2) && (typeof range !== "string" || !range.startsWith("workspace:") && !matches(runtime, range))) {
        add("embedded-runtime", [plugin.name], `${plugin.name} \u76F4\u63A5\u4F9D\u8D56 ${name2} ${String(range)}\uFF0C\u4F1A\u5F15\u5165\u4E0E\u5BBF\u4E3B ${runtime} \u4E0D\u4E00\u81F4\u7684\u6838\u5FC3\u7EC4\u4EF6\uFF1B\u5E94\u7531\u7EF4\u62A4\u8005\u6539\u4E3A\u5339\u914D\u7684 peerDependencies`);
      }
    }
    if (plugin.manifest.engines?.node && !matches(options.nodeVersion ?? process.version, plugin.manifest.engines.node)) {
      add("node-version", [plugin.name], `${plugin.name} \u8981\u6C42 Node.js ${plugin.manifest.engines.node}`);
    }
    const platform = options.platform ?? process.platform;
    const os = plugin.manifest.os;
    if (os && (os.includes(`!${platform}`) || os.some((x) => !x.startsWith("!")) && !os.includes(platform)) || meta.platforms && !meta.platforms.includes(platform)) add("platform", [plugin.name], `${plugin.name} \u4E0D\u652F\u6301 ${platform}`);
    for (const [name2, range] of Object.entries(meta.requires ?? {})) {
      const dependency = byName.get(name2);
      if (!dependency) add("missing-dependency", [plugin.name], `${plugin.name} \u9700\u8981\u542F\u7528 ${name2} ${range}`);
      else if (!matches(dependency.version, range)) add("dependency-version", [plugin.name], `${plugin.name} \u9700\u8981 ${name2} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency.version}`);
    }
    for (const [name2, range] of Object.entries(peers)) {
      if (name2 === "@deepseek-ai/dsh" || name2.startsWith("@deepseek-ai/dsh-") || typeof range !== "string") continue;
      const dependency = byName.get(name2)?.version ?? options.dependencyVersions?.[name2];
      if (dependency && !range.startsWith("workspace:") && !matches(dependency, range)) {
        add("dependency-version", [plugin.name], `${plugin.name} \u8981\u6C42 peer ${name2} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency}`);
      }
    }
    for (const [name2, range] of Object.entries(meta.conflicts ?? {})) {
      const other = byName.get(name2);
      if (other && other !== plugin && matches(other.version, range)) add("declared-conflict", [plugin.name, name2], `${plugin.name} \u4E0E ${name2}@${other.version} \u51B2\u7A81`);
    }
    if (plugin.loadError || plugin.state === "failed") add("load-failure", [plugin.name], plugin.loadError ?? `${plugin.name} \u7684\u8FD0\u884C\u5B9E\u4F8B\u52A0\u8F7D\u5931\u8D25`);
    for (const id of plugin.duplicateRowIds ?? []) add("duplicate-row", [plugin.name], `${plugin.name} \u91CD\u590D\u58F0\u660E\u9876\u5C42\u6761\u76EE ${id}`);
    for (const [kind, values] of [["row", plugin.rowIds], ["service", meta.services ?? []], ["tool", meta.tools ?? []]]) {
      for (const value of new Set(values)) {
        const key2 = `${kind}:${value}`;
        claims.set(key2, [...claims.get(key2) ?? [], plugin.name]);
      }
    }
  }
  for (const [claim, plugins] of claims) {
    if (plugins.length < 2) continue;
    const [kind, ...name2] = claim.split(":");
    add(`duplicate-${kind}`, plugins, `${plugins.join("\u3001")} \u91CD\u590D\u63D0\u4F9B ${kind} ${name2.join(":")}`);
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

// src/planner.ts
var patterns = {
  pdf: /\bpdf\b|扫描件|扫描文档/iu,
  web: /\b(web|search|browse|online|latest|documentation)\b|联网|搜索|检索|查.{0,5}资料|最新|网页|官方文档/iu,
  code: /\b(code|repo|repository|debug|refactor|typescript|python)\b|代码|仓库|调试|重构|编程|项目/iu,
  git: /\bgit\b|\bcommit\b|\bbranch\b|分支|提交|合并/iu,
  browser: /\b(browser|playwright|puppeteer)\b|浏览器|点击网页|表单/iu,
  vision: /\b(vision|image|ocr)\b|识图|图片|图像|截图/iu,
  memory: /\bmemory\b|长期记忆|跨会话记忆/iu,
  shell: /\b(shell|terminal|command)\b|终端|命令行/iu
};
function inferCapabilities(task) {
  if (!task.trim() || task.length > 3e4) throw new Error("\u4EFB\u52A1\u9700\u8981 1\u201330000 \u4E2A\u5B57\u7B26");
  return Object.entries(patterns).filter(([, regex]) => regex.test(task)).map(([key2]) => key2);
}
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
  const explanation = ["\u4F7F\u7528\u72EC\u7ACB DSH_HOME \u548C sdk profile\uFF1B\u914D\u7F6E\u9694\u79BB\u4E0D\u7B49\u4E8E\u64CD\u4F5C\u7CFB\u7EDF\u5B89\u5168\u6C99\u7BB1\u3002"];
  const rejected = /* @__PURE__ */ new Set();
  const addDependencies = (candidate, group, visiting) => {
    if (visiting.has(candidate.name)) return false;
    const existing = selected.find((x) => x.name === candidate.name) ?? group.get(candidate.name);
    if (existing) return existing.version === candidate.version;
    group.set(candidate.name, candidate);
    visiting.add(candidate.name);
    for (const [name2, range] of Object.entries(compatMetadata(candidate.manifest.dshCompat).requires ?? {})) {
      if (visiting.has(name2)) return false;
      const chosen = selected.find((x) => x.name === name2) ?? group.get(name2);
      if (chosen) {
        if (!semver3.satisfies(chosen.version, range, { includePrerelease: true })) return false;
        continue;
      }
      const dependency = byName.get(name2)?.filter((x) => semver3.satisfies(x.version, range, { includePrerelease: true })).sort((a, b) => semver3.rcompare(a.version, b.version))[0];
      if (!dependency || !addDependencies(dependency, group, visiting)) return false;
    }
    visiting.delete(candidate.name);
    return true;
  };
  while (capabilities.some((x) => !coverage().has(x))) {
    const alternatives = [];
    for (const item of input.catalog) {
      const key2 = `${item.name}@${item.version}`;
      if (rejected.has(key2) || selected.some((x) => x.name === item.name)) continue;
      const group = /* @__PURE__ */ new Map();
      if (!addDependencies(item, group, /* @__PURE__ */ new Set())) {
        rejected.add(key2);
        continue;
      }
      const values = [...group.values()];
      const gained = new Set(values.flatMap((x) => x.capabilities).filter((x) => capabilities.includes(x) && !coverage().has(x))).size;
      if (!gained) continue;
      const report = checkCompatibility([...selected, ...values].map(candidateRecord), input.runtimeVersion);
      if (report.findings.some((x) => x.severity === "error")) {
        rejected.add(key2);
        explanation.push(`${key2} \u56E0\u517C\u5BB9\u6027\u6216\u4F9D\u8D56\u95EE\u9898\u88AB\u6392\u9664\u3002`);
        continue;
      }
      const penalty = new Set(values.flatMap((x) => x.permissions)).size;
      alternatives.push({ group: values, score: gained * 100 - values.length * 10 - penalty, key: key2 });
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
var hints = {
  pdf: /\bpdf\b|PDF|文档/iu,
  browser: /browser|playwright|puppeteer|浏览器/iu,
  vision: /vision|image|ocr|图像|识图|图片/iu,
  memory: /memory|记忆/iu
};
async function planTask(input) {
  const catalog = await loadCatalog(input.catalog, input.signal);
  const initial = createPlan({ ...input, catalog, runtimeVersion: RUNTIME_VERSION });
  if (input.autoDiscover === false || !initial.missing.length) return initial;
  const notes = [];
  const found = [];
  for (const capability of initial.missing.slice(0, 4)) {
    if (!hints[capability]) continue;
    try {
      const suggestions = (await discover(capability, input.signal)).filter((x) => hints[capability].test(`${x.name} ${x.description}`)).slice(0, 5);
      const checked = await Promise.allSettled(suggestions.map(async (suggestion) => {
        const candidate = await inspectCandidate(suggestion.name, suggestion.version, void 0, input.signal);
        if (!candidate.capabilities.length) {
          candidate.capabilities = [capability];
          candidate.capabilitySource = "search";
        }
        return candidate;
      }));
      checked.forEach((result, index) => {
        if (result.status === "fulfilled") found.push(result.value);
        else notes.push(`${suggestions[index].name} \u5143\u6570\u636E\u672A\u901A\u8FC7\uFF1A${String(result.reason)}`);
      });
    } catch (error) {
      input.signal?.throwIfAborted();
      notes.push(`${capability} \u5728\u7EBF\u53D1\u73B0\u5931\u8D25\uFF1A${String(error)}`);
    }
  }
  const unique = new Map(catalog.map((x) => [`${x.name}@${x.version}`, x]));
  for (const candidate of found) {
    const key2 = `${candidate.name}@${candidate.version}`;
    const existing = unique.get(key2);
    if (existing && existing.capabilitySource === "search") existing.capabilities = [.../* @__PURE__ */ new Set([...existing.capabilities, ...candidate.capabilities])];
    else if (!existing) unique.set(key2, candidate);
  }
  const plan = createPlan({ ...input, catalog: [...unique.values()], runtimeVersion: RUNTIME_VERSION });
  for (const candidate of plan.selected.filter((x) => x.capabilitySource === "search")) {
    notes.push(`${candidate.name} \u7684\u80FD\u529B\u6839\u636E npm \u540D\u79F0\u4E0E\u8BF4\u660E\u63A8\u65AD\uFF0C\u5C1A\u672A\u9A8C\u8BC1\u529F\u80FD\uFF1B\u5B8C\u6574\u6743\u9650\u4EE5\u7B2C\u4E09\u65B9 Host \u4EE3\u7801\u4E3A\u51C6\u3002`);
  }
  plan.explanation.push(...notes);
  const { fingerprint: _old, ...body } = plan;
  plan.fingerprint = digest(JSON.stringify(body));
  return plan;
}

// src/runner.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { mkdir as mkdir2, stat } from "node:fs/promises";
import { createRequire as createRequire2 } from "node:module";
import { join as join3, resolve as resolve3 } from "node:path";
import { stringify } from "yaml";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";

// shared/process.ts
import { spawn, execFile } from "node:child_process";
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
  for (const key2 of [...system, ...keys]) {
    if (/^(NODE_OPTIONS|NODE_PATH|LD_|DYLD_|BASH_ENV|ENV$|DSH_)/.test(key2)) throw new Error(`\u4E0D\u5141\u8BB8\u8F6C\u53D1\u8FD0\u884C\u65F6\u6CE8\u5165\u53D8\u91CF\uFF1A${key2}`);
    if (parent[key2] !== void 0) env[key2] = parent[key2];
  }
  return { ...env, DSH_TELEMETRY_DISABLED: "1" };
}
async function runProcess(command, args, options) {
  options.signal?.throwIfAborted();
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 18e4)]) : AbortSignal.timeout(options.timeoutMs ?? 18e4);
  return new Promise((resolve6, reject) => {
    const child = spawn(command, args, {
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
        resolve6({ code, output });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// shared/profile.ts
import { readFile as readFile2, realpath as realpath2 } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";
import { parseDocument } from "yaml";

// shared/types.ts
var protectedNames = /* @__PURE__ */ new Set(["dsh-compat-guardian", "dsh-autocompose"]);
function isProtected(name2) {
  return name2.startsWith("@deepseek-ai/") || protectedNames.has(name2);
}

// shared/profile.ts
async function locateManifest(name2, anchors) {
  packageName(name2);
  for (const anchor of anchors) {
    const require3 = createRequire(resolve2(anchor));
    for (const searchPath of require3.resolve.paths(name2) ?? []) {
      const direct = join2(searchPath, ...name2.split("/"), "package.json");
      const raw = await optionalText(direct);
      if (raw !== void 0) {
        const manifest = object(JSON.parse(raw), direct);
        if (manifest.name !== name2) throw new Error(`\u5305\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF1A\u9700\u8981 ${name2}\uFF0C\u5B9E\u9645 ${manifest.name}`);
        return { manifest, directory: dirname2(await realpath2(direct)) };
      }
    }
    let entry;
    try {
      entry = require3.resolve(`${name2}/package.json`);
    } catch {
      try {
        entry = require3.resolve(name2);
      } catch {
        continue;
      }
    }
    let dir = dirname2(entry);
    for (; ; ) {
      const text = await optionalText(join2(dir, "package.json"));
      if (text) {
        const manifest = object(JSON.parse(text), "package.json");
        if (manifest.name === name2) return { manifest, directory: await realpath2(dir) };
      }
      if (dirname2(dir) === dir) break;
      dir = dirname2(dir);
    }
  }
  throw new Error(`\u627E\u4E0D\u5230\u5DF2\u5B89\u88C5\u7684 ${name2}\uFF0C\u672A\u5BFC\u5165\u63D2\u4EF6\u4EE3\u7801`);
}
async function declaredRows(directory, manifest) {
  const patch = manifest.dsh?.bundle?.patch;
  if (!patch) return { rowIds: [], duplicateRowIds: [] };
  const files = typeof patch === "string" ? [patch] : patch;
  if (!Array.isArray(files) || files.some((x) => typeof x !== "string")) throw new Error("bundle.patch \u683C\u5F0F\u65E0\u6548");
  const rowIds = [], duplicates = /* @__PURE__ */ new Set();
  for (const file of files) {
    const path = within(directory, resolve2(directory, file));
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
async function checkClientArtifact(directory, manifest) {
  const dsh = manifest.dsh;
  if (dsh?.client?.platform !== "web") return;
  const exported = manifest.exports?.["./client"];
  const client = typeof exported === "string" ? exported : exported && typeof exported === "object" ? exported.default : void 0;
  if (typeof client !== "string" || !client.startsWith("./")) throw new Error(`${manifest.name} \u7F3A\u5C11\u53EF\u7528\u7684 ./client \u5BFC\u51FA`);
  const file = within(directory, resolve2(directory, client));
  within(await realpath2(directory), await realpath2(file));
}
async function scanProfile(directory, installAnchor) {
  const profilePath = join2(directory, "package.json");
  const manifest = object(JSON.parse(await readFile2(profilePath, "utf8")), "profile package.json");
  const selected = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(selected) || selected.some((x) => typeof x !== "string")) throw new Error("\u76EE\u6807\u76EE\u5F55\u6CA1\u6709\u6709\u6548\u7684 dsh.profile.bundles");
  const names = [.../* @__PURE__ */ new Set([...selected, ...Object.keys(manifest.dependencies ?? {})])];
  const records = [];
  for (const name2 of names) {
    const base = { name: name2, enabled: selected.includes(name2), protected: isProtected(name2), removable: Object.hasOwn(manifest.dependencies ?? {}, name2) && !isProtected(name2) };
    try {
      const { manifest: installed, directory: packageDir } = await locateManifest(name2, [...installAnchor ? [installAnchor] : [], profilePath]);
      if (!installed.dsh?.bundle && !base.enabled) continue;
      let rows = { rowIds: [], duplicateRowIds: [] };
      let loadError;
      try {
        rows = await declaredRows(packageDir, installed);
        await checkClientArtifact(packageDir, installed);
      } catch (error) {
        loadError = String(error);
      }
      if (!installed.dsh?.bundle) loadError = `${name2} \u672A\u58F0\u660E dsh.bundle`;
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

// src/runner.ts
var require2 = createRequire2(import.meta.url);
var activeRuns = /* @__PURE__ */ new Set();
var defaultDshBin = () => require2.resolve("@deepseek-ai/dsh/lib/bin.js");
function runIsActive(evidence) {
  if (evidence.processId === process.pid) return activeRuns.has(evidence.id);
  if (!Number.isSafeInteger(evidence.processId) || evidence.processId <= 0) return false;
  try {
    process.kill(evidence.processId, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
async function runPlan(plan, options) {
  const { fingerprint, ...body } = plan;
  if (digest(JSON.stringify(body)) !== fingerprint) throw new Error("\u8BA1\u5212\u5185\u5BB9\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210");
  const timeoutMs = options.timeoutMs ?? 6e5;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1e3 || timeoutMs > 72e5) throw new Error("timeoutMs \u5FC5\u987B\u4ECB\u4E8E 1000 \u548C 7200000");
  if (plan.missing.length) throw new Error(`\u7F3A\u5C11\u80FD\u529B\uFF1A${plan.missing.join("\u3001")}\u3002\u8BF7\u6DFB\u52A0\u5019\u9009\u63D2\u4EF6\u6216\u8C03\u6574\u80FD\u529B\u5217\u8868\u3002`);
  if (plan.report.findings.some((x) => x.severity === "error")) throw new Error("\u7EC4\u5408\u5B58\u5728\u517C\u5BB9\u6027\u9519\u8BEF");
  if (plan.runtimeVersion !== RUNTIME_VERSION) throw new Error(`\u672C\u7248\u6267\u884C\u5668\u4F7F\u7528 DSH ${RUNTIME_VERSION}\uFF0C\u8BF7\u636E\u6B64\u91CD\u65B0\u89C4\u5212`);
  if (!(await stat(plan.cwd)).isDirectory()) throw new Error("\u4EFB\u52A1\u5DE5\u4F5C\u76EE\u5F55\u4E0D\u5B58\u5728");
  const root = resolve3(options.root), runs = join3(root, "runs");
  await mkdir2(runs, { recursive: true });
  return withLock(join3(root, `run-${plan.id}.lock`), async () => {
    options.signal?.throwIfAborted();
    const id = randomUUID3(), directory = join3(runs, id), home = join3(directory, "home");
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
      const env = { ...childEnvironment(options.envKeys ?? ["DEEPSEEK_API_KEY"]), DSH_HOME: home };
      await runProcess(process.execPath, [defaultDshBin(), "--profile", "sdk", "--dump-config"], { cwd: directory, env, signal });
      for (const candidate of plan.selected.filter((x) => x.source === "npm")) {
        await progress("installing", candidate.name);
        const current = await inspectCandidate(candidate.name, candidate.version, candidate.capabilities, signal);
        if (current.integrity !== candidate.integrity || current.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} \u7684\u5143\u6570\u636E\u6216\u5236\u54C1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u89C4\u5212`);
        await runProcess(process.execPath, [
          defaultDshBin(),
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
      const installed = await scanProfile(join3(home, "profiles", "sdk"), require2.resolve("@deepseek-ai/dsh/package.json"));
      const report = checkCompatibility(installed, RUNTIME_VERSION);
      const failures = report.findings.filter((x) => x.severity === "error");
      if (failures.length) throw new Error(`\u5B9E\u9645\u5B89\u88C5\u540E\u68C0\u67E5\u5931\u8D25\uFF1A${failures.map((x) => x.message).join("; ")}`);
      const patch = join3(directory, "execution.patch.yml");
      await atomicWrite(patch, stringify([
        { id: "sandbox-policy", config: { mode: options.mode ?? "read-only", workspaceRoot: plan.cwd } },
        { id: "tool-plugin-manager", disabled: true }
      ]));
      harness = new DeepSeekHarness({
        dshBin: defaultDshBin(),
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
async function savePreset(root, name2, plan) {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name2)) throw new Error("\u9884\u8BBE\u540D\u79F0\u53EA\u5141\u8BB8\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u77ED\u6A2A\u7EBF\u548C\u4E0B\u5212\u7EBF");
  const path = join3(root, "presets", `${name2}.json`);
  await writeJson(path, { schemaVersion: 1, name: name2, savedAt: (/* @__PURE__ */ new Date()).toISOString(), plan });
  return path;
}
async function loadPreset(root, name2, task) {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name2)) throw new Error("\u9884\u8BBE\u540D\u79F0\u65E0\u6548");
  const saved = await readJson(join3(root, "presets", `${name2}.json`));
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

// src/index.ts
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";

// src/controller.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { readdir, stat as stat2 } from "node:fs/promises";
import { join as join4, resolve as resolve4 } from "node:path";
import { z } from "zod";

// shared/rpc.ts
import { string as string2 } from "zod";
function parseRequest(schema, payload) {
  if (Buffer.byteLength(payload, "utf8") > 65536) throw new Error("\u8BF7\u6C42\u8FC7\u5927");
  return schema.parse(JSON.parse(payload));
}

// src/controller.ts
var key = z.string().uuid();
var presetName = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
var requests = z.discriminatedUnion("action", [
  z.object({ action: z.literal("overview") }).strict(),
  z.object({
    action: z.literal("plan"),
    task: z.string().trim().min(1).max(3e4),
    cwd: z.string().min(1).max(4096),
    capabilities: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,40}$/)).max(20).optional()
  }).strict(),
  z.object({
    action: z.literal("start"),
    planId: key,
    fingerprint: z.string().length(64),
    mode: z.enum(["read-only", "workspace-write"]),
    keep: z.boolean()
  }).strict(),
  z.object({ action: z.literal("cancel"), jobId: key }).strict(),
  z.object({ action: z.literal("savePreset"), planId: key, name: presetName }).strict(),
  z.object({ action: z.literal("loadPreset"), name: presetName }).strict(),
  z.object({ action: z.literal("getPlan"), planId: key }).strict()
]);
async function recent(directory, count, notices) {
  let names;
  try {
    names = (await readdir(directory)).filter((x) => x.endsWith(".json"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(names.map(async (name2) => ({ name: name2, time: (await stat2(join4(directory, name2))).mtimeMs })));
  const values = await Promise.allSettled(files.sort((a, b) => b.time - a.time).slice(0, count).map((x) => readJson(join4(directory, x.name))));
  const result = [];
  for (const value of values) {
    if (value.status === "fulfilled") result.push(value.value);
    else notices.push("\u6709\u4E00\u6761\u672C\u5730\u8BB0\u5F55\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u5176\u4F59\u8BB0\u5F55\u4ECD\u53EF\u4F7F\u7528\u3002");
  }
  return result;
}
var ComposeController = class {
  constructor(options) {
    this.options = options;
  }
  jobs = /* @__PURE__ */ new Map();
  disposed = false;
  launch(kind, work) {
    if (this.disposed) throw new Error("\u63D2\u4EF6\u6B63\u5728\u5173\u95ED");
    if ([...this.jobs.values()].some((x) => ["running", "cancelling"].includes(x.view.status))) throw new Error("\u5DF2\u6709\u4EFB\u52A1\u6B63\u5728\u5904\u7406\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u6216\u53D6\u6D88");
    const abort = new AbortController();
    const view = { id: randomUUID4(), kind, status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    const promise = Promise.resolve().then(() => work(abort.signal, view)).then(() => {
      view.status = abort.signal.aborted || view.run?.status === "cancelled" ? "cancelled" : view.run?.status === "failed" ? "failed" : "completed";
    }).catch((error) => {
      view.status = abort.signal.aborted ? "cancelled" : "failed";
      view.error = String(error);
    });
    this.jobs.set(view.id, { view, abort, promise });
    while (this.jobs.size > 12) this.jobs.delete(this.jobs.keys().next().value);
    return structuredClone(view);
  }
  async ownedPlan(id) {
    const plan = await loadPlan(this.options.root, id);
    if (plan.owner !== "web-ui") throw new Error("\u8BF7\u5728\u81EA\u7EC4\u88C5\u9875\u9762\u91CD\u65B0\u751F\u6210\u6B64\u8BA1\u5212");
    return plan;
  }
  async overview() {
    const notices = [];
    const [history, presets, plans] = await Promise.all([
      recent(join4(this.options.root, "history"), 30, notices),
      recent(join4(this.options.root, "presets"), 30, notices),
      recent(join4(this.options.root, "plans"), 20, notices)
    ]);
    const active = new Set([...this.jobs.values()].map((x) => x.view.run?.id));
    return {
      cwd: process.cwd(),
      runtimeVersion: RUNTIME_VERSION,
      jobs: [...this.jobs.values()].map((x) => structuredClone(x.view)).reverse(),
      history: history.map((x) => x.status === "running" && !active.has(x.id) && !runIsActive(x) ? { ...x, status: "interrupted", error: "\u4E0A\u6B21\u8FD0\u884C\u8FDB\u7A0B\u5DF2\u7ED3\u675F\uFF0C\u672A\u4FDD\u5B58\u6700\u7EC8\u7ED3\u679C\u3002\u8BF7\u68C0\u67E5\u8BE6\u60C5\u4E2D\u7684\u4E34\u65F6\u76EE\u5F55\u3002" } : x),
      presets: presets.filter((x) => x.plan?.owner === "web-ui").map((x) => ({ name: x.name, task: x.plan.task })),
      plans: plans.filter((x) => x.owner === "web-ui"),
      notices: [...new Set(notices)]
    };
  }
  async request(payload) {
    const args = parseRequest(requests, payload);
    if (this.disposed) throw new Error("\u63D2\u4EF6\u6B63\u5728\u5173\u95ED");
    if (args.action === "overview") return JSON.stringify(await this.overview());
    if (args.action === "plan") {
      const cwd = resolve4(args.cwd);
      if (!(await stat2(cwd)).isDirectory()) throw new Error("\u8BF7\u9009\u62E9\u5B58\u5728\u7684\u5DE5\u4F5C\u76EE\u5F55");
      return JSON.stringify(this.launch("plan", async (signal, job) => {
        const plan2 = await planTask({
          task: args.task,
          cwd,
          capabilities: args.capabilities,
          owner: "web-ui",
          catalog: this.options.catalog,
          autoDiscover: this.options.autoDiscover,
          signal
        });
        signal.throwIfAborted();
        await savePlan(this.options.root, plan2);
        job.plan = plan2;
      }));
    }
    if (args.action === "start") {
      const plan2 = await this.ownedPlan(args.planId);
      if (plan2.fingerprint !== args.fingerprint) throw new Error("\u65B9\u6848\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u67E5\u770B\u540E\u8FD0\u884C");
      return JSON.stringify(this.launch("run", async (signal, job) => {
        job.plan = plan2;
        job.run = await runPlan(plan2, {
          ...this.options,
          signal,
          mode: args.mode,
          keep: args.keep,
          onProgress: (value) => {
            job.run = value;
          }
        });
      }));
    }
    if (args.action === "cancel") {
      const job = this.jobs.get(args.jobId);
      if (!job) throw new Error("\u4EFB\u52A1\u4E0D\u5B58\u5728");
      if (job.view.status === "running") {
        job.view.status = "cancelling";
        job.abort.abort();
      }
      return JSON.stringify(job.view);
    }
    if (args.action === "getPlan") return JSON.stringify(await this.ownedPlan(args.planId));
    if (args.action === "savePreset") {
      await savePreset(this.options.root, args.name, await this.ownedPlan(args.planId));
      return JSON.stringify({ saved: true });
    }
    const plan = await loadPreset(this.options.root, args.name);
    if (plan.owner !== "web-ui") throw new Error("\u8BE5\u9884\u8BBE\u6765\u81EA\u5176\u4ED6\u4F1A\u8BDD");
    await savePlan(this.options.root, plan);
    return JSON.stringify(plan);
  }
  async dispose() {
    this.disposed = true;
    for (const job of this.jobs.values()) job.abort.abort();
    await Promise.allSettled([...this.jobs.values()].map((x) => x.promise));
  }
};

// src/index.ts
var _request_dec, _a, _init;
var AutocomposeUI = class extends (_a = TypertRemoteService, _request_dec = [Remote], _a) {
  constructor(ctx, controller) {
    super(ctx, "autocomposeUI");
    this.controller = controller;
    __runInitializers(_init, 5, this);
  }
  async request(payload) {
    return this.controller.request(payload);
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "request", _request_dec, AutocomposeUI);
__decoratorMetadata(_init, AutocomposeUI);
var name = "dsh-autocompose";
var inject = ["tools", "sandboxPolicy"];
function apply(ctx, config = {}) {
  const root = resolve5(config.root ?? join5(process.env.DSH_HOME ?? join5(homedir(), ".dsh"), "autocompose"));
  const controller = new ComposeController({ ...config, root });
  new AutocomposeUI(ctx, controller);
  ctx.effect(() => () => controller.dispose(), "autocompose: browser jobs");
  const disposal = new AbortController();
  const running = /* @__PURE__ */ new Set();
  ctx.effect(() => async () => {
    disposal.abort();
    await Promise.allSettled(running);
  }, "autocompose: close owned runtimes");
  ctx.tools.register(defineTool({
    name: "autocompose",
    description: "\u6309\u4EFB\u52A1\u9009\u62E9\u517C\u5BB9\u63D2\u4EF6\u5E76\u751F\u6210\u8BA1\u5212\uFF0C\u5BA1\u6838\u540E\u5728\u72EC\u7ACB DSH_HOME \u4E2D\u8FD0\u884C\u3002\u5148 plan \u67E5\u770B\u80FD\u529B\u3001\u5305\u7248\u672C\u3001\u6743\u9650\u548C\u8B66\u544A\uFF0C\u518D run \u6307\u5B9A planId\u3002\u4E34\u65F6\u73AF\u5883\u9694\u79BB\u914D\u7F6E\uFF0C\u4F46\u7B2C\u4E09\u65B9 Host \u4EE3\u7801\u4ECD\u6709\u5BBF\u4E3B\u673A\u6743\u9650\u3002\u9ED8\u8BA4\u53EA\u8BFB\u4EFB\u52A1\u76EE\u5F55\uFF1B\u8FD0\u884C\u4E0E\u4FDD\u5B58\u9884\u8BBE\u9075\u5B88 DSH \u4EBA\u5DE5\u6279\u51C6\u673A\u5236\u3002",
    parameters: {
      action: { type: "string", required: true, enum: ["plan", "run", "save_preset", "discover"] },
      task: { type: "string", description: "plan \u7684\u4EFB\u52A1\u6587\u672C\uFF1Bdiscover \u7684\u82F1\u6587\u80FD\u529B\u540D\u79F0\u3002" },
      capabilities: { type: "array", items: { type: "string" }, description: "\u53EF\u9009\uFF0C\u8986\u76D6\u89C4\u5219\u63A8\u65AD\u7684\u80FD\u529B\u5217\u8868\u3002" },
      planId: { type: "string" },
      preset: { type: "string" },
      mode: { type: "string", enum: ["read-only", "workspace-write"], description: "run \u7684\u4EFB\u52A1\u76EE\u5F55\u6743\u9650\uFF0C\u9ED8\u8BA4 read-only\u3002" }
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args, exec2) {
      const signal = AbortSignal.any([exec2.signal, disposal.signal]);
      signal.throwIfAborted();
      if (args.action === "discover") return JSON.stringify(await discover(args.task ?? "", signal));
      const owner = exec2.agent?.session.id;
      if (args.action === "plan") {
        const plan2 = await planTask({
          task: args.task ?? "",
          cwd: exec2.agent?.session.header.cwd ?? process.cwd(),
          owner,
          catalog: config.catalog,
          capabilities: args.capabilities,
          autoDiscover: config.autoDiscover,
          signal
        });
        await savePlan(root, plan2);
        return JSON.stringify(plan2);
      }
      const plan = await loadPlan(root, args.planId ?? "");
      if (plan.owner !== owner) throw new Error("\u8BE5\u8BA1\u5212\u5C5E\u4E8E\u53E6\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u91CD\u65B0\u89C4\u5212");
      await approve(ctx, exec2, "autocompose operation", `${args.action}: ${plan.selected.map((x) => `${x.name}@${x.version}`).join(", ")}; \u6743\u9650 ${plan.permissions.join(", ")}; mode=${args.mode ?? "read-only"}; workspace=${plan.cwd}; plan=${plan.fingerprint}`);
      if (args.action === "save_preset") return JSON.stringify({ path: await savePreset(root, args.preset ?? "", plan) });
      const promise = runPlan(plan, {
        root,
        provider: config.provider,
        model: config.model,
        envKeys: config.envKeys,
        timeoutMs: config.timeoutMs,
        signal,
        mode: args.mode
      });
      running.add(promise);
      try {
        return JSON.stringify(await promise);
      } finally {
        running.delete(promise);
      }
    }
  }));
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
