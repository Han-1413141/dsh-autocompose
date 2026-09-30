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
import { join as join6, resolve as resolve7 } from "node:path";
import { getDshRuntimeVersion } from "@deepseek-ai/dsh-app-boot";
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
async function inspectCandidate(name2, exactVersion, capabilities, signal) {
  packageName(name2);
  version(exactVersion);
  const data = await registryJson(`${encodeURIComponent(name2)}/${encodeURIComponent(exactVersion)}`, signal);
  if (data.name !== name2 || data.version !== exactVersion) throw new Error("npm \u5305\u8EAB\u4EFD\u4E0E\u8BF7\u6C42\u4E0D\u4E00\u81F4");
  if (!data.dsh?.bundle?.patch) throw new Error(`${name2} \u672A\u58F0\u660E DSH bundle`);
  const meta = compatMetadata(data.dshCompat);
  const dist = object(data.dist, "npm dist");
  const integrity = string(dist.integrity, "dist.integrity");
  const manifest2 = packageMetadata(data);
  return {
    name: name2,
    version: exactVersion,
    capabilities: capabilities ?? meta.capabilities ?? [],
    permissions: meta.permissions ?? ["host-code: filesystem, network, processes"],
    description: data.description ?? name2,
    source: "npm",
    manifest: manifest2,
    integrity,
    capabilitySource: capabilities ? "catalog" : "manifest",
    metadataHash: digest(JSON.stringify(manifest2))
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
  const explanation = ["\u53EF\u9009\u62E9\u5728\u72EC\u7ACB DSH_HOME \u4E2D\u4E34\u65F6\u8FD0\u884C\uFF0C\u6216\u5C06\u9009\u4E2D\u7684\u7B2C\u4E09\u65B9\u63D2\u4EF6\u5B89\u88C5\u5230\u5F53\u524D\u4E3B\u73AF\u5883\u3002"];
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
    return new Promise((resolve8, reject) => {
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
          resolve8(value);
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
    return new Promise((resolve8, reject) => {
      this.output.write("", (error) => {
        if (error) reject(error);
        else resolve8();
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
  return new Promise((resolve8) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve8(true);
    };
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve8(false);
    }, ms).unref();
    child.once("exit", onExit);
  });
}
function forceTerminateWithin(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve8, reject) => {
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
      settle(resolve8);
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
      if (child.exitCode !== null || child.signalCode !== null) settle(resolve8);
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
    return new Promise((resolve8, reject) => {
      this.state.waiters.push({
        resolve: resolve8,
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
    this.streamsSettled = new Promise((resolve8) => {
      signalStreamsSettled = resolve8;
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
    return Promise.race([this.streamsSettled, new Promise((resolve8) => {
      setTimeout(resolve8, STREAM_SETTLE_MS);
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
  for (const key2 of [...system, ...keys]) {
    if (/^(NODE_OPTIONS|NODE_PATH|LD_|DYLD_|BASH_ENV|ENV$|DSH_)/.test(key2)) throw new Error(`\u4E0D\u5141\u8BB8\u8F6C\u53D1\u8FD0\u884C\u65F6\u6CE8\u5165\u53D8\u91CF\uFF1A${key2}`);
    if (parent[key2] !== void 0) env[key2] = parent[key2];
  }
  return { ...env, DSH_TELEMETRY_DISABLED: "1" };
}
async function runProcess(command, args, options) {
  options.signal?.throwIfAborted();
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 18e4)]) : AbortSignal.timeout(options.timeoutMs ?? 18e4);
  return new Promise((resolve8, reject) => {
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
        resolve8({ code, output });
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
function isProtected(name2) {
  return name2.startsWith("@deepseek-ai/") || protectedNames.has(name2);
}

// shared/profile.ts
async function locateManifest(name2, anchors) {
  packageName(name2);
  for (const anchor of anchors) {
    const require2 = createRequire(resolve3(anchor));
    for (const searchPath of require2.resolve.paths(name2) ?? []) {
      const direct = join2(searchPath, ...name2.split("/"), "package.json");
      const raw = await optionalText(direct);
      if (raw !== void 0) {
        const manifest2 = object(JSON.parse(raw), direct);
        if (manifest2.name !== name2) throw new Error(`\u5305\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF1A\u9700\u8981 ${name2}\uFF0C\u5B9E\u9645 ${manifest2.name}`);
        return { manifest: manifest2, directory: dirname3(await realpath2(direct)) };
      }
    }
    let entry;
    try {
      entry = require2.resolve(`${name2}/package.json`);
    } catch {
      try {
        entry = require2.resolve(name2);
      } catch {
        continue;
      }
    }
    let dir = dirname3(entry);
    for (; ; ) {
      const text = await optionalText(join2(dir, "package.json"));
      if (text) {
        const manifest2 = object(JSON.parse(text), "package.json");
        if (manifest2.name === name2) return { manifest: manifest2, directory: await realpath2(dir) };
      }
      if (dirname3(dir) === dir) break;
      dir = dirname3(dir);
    }
  }
  throw new Error(`\u627E\u4E0D\u5230\u5DF2\u5B89\u88C5\u7684 ${name2}\uFF0C\u672A\u5BFC\u5165\u63D2\u4EF6\u4EE3\u7801`);
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
  for (const name2 of names) {
    const base = { name: name2, enabled: selected.includes(name2), protected: isProtected(name2), removable: Object.hasOwn(manifest2.dependencies ?? {}, name2) && !isProtected(name2) };
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
import { randomUUID as randomUUID6 } from "node:crypto";
import { readdir, stat as stat2 } from "node:fs/promises";
import { join as join4, resolve as resolve6 } from "node:path";
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
  z.object({ action: z.literal("getPlan"), planId: key }).strict(),
  z.object({ action: z.literal("previewInstall"), planId: key, fingerprint: z.string().length(64) }).strict(),
  z.object({ action: z.literal("install"), previewId: key }).strict()
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
    const view = { id: randomUUID6(), kind, status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    const promise = Promise.resolve().then(() => work(abort.signal, view)).then(() => {
      view.status = abort.signal.aborted || view.run?.status === "cancelled" || view.install?.status === "cancelled" ? "cancelled" : view.run?.status === "failed" || view.install && view.install.status !== "completed" ? "failed" : "completed";
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
    const [history, presets, plans, installations] = await Promise.all([
      recent(join4(this.options.root, "history"), 30, notices),
      recent(join4(this.options.root, "presets"), 30, notices),
      recent(join4(this.options.root, "plans"), 20, notices),
      recent(join4(this.options.root, "installations"), 30, notices)
    ]);
    const active = new Set([...this.jobs.values()].map((x) => x.view.run?.id));
    return {
      cwd: process.cwd(),
      runtimeVersion: RUNTIME_VERSION,
      jobs: [...this.jobs.values()].map((x) => structuredClone(x.view)).reverse(),
      mainEnvironment: this.options.installer?.target(),
      installations: installations.map((x) => x.status === "running" && !this.options.installer?.isActive(x) ? { ...x, status: "interrupted", error: "\u5B89\u88C5\u8FDB\u7A0B\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u5728\u63D2\u4EF6\u7BA1\u7406\u4E2D\u68C0\u67E5\u5DF2\u5B89\u88C5\u7684\u5305\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B89\u88C5\u9884\u89C8\u3002" } : x),
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
      const cwd = resolve6(args.cwd);
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
    if (args.action === "previewInstall") {
      if (!this.options.installer) throw new Error("\u8BF7\u5728 DSH \u9875\u9762\u4E2D\u4F7F\u7528\u4E3B\u73AF\u5883\u5B89\u88C5\u3002");
      const plan2 = await this.ownedPlan(args.planId);
      if (plan2.fingerprint !== args.fingerprint) throw new Error("\u65B9\u6848\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u67E5\u770B\u3002");
      return JSON.stringify(await this.options.installer.preview(plan2));
    }
    if (args.action === "install") {
      const installer = this.options.installer;
      if (!installer) throw new Error("\u8BF7\u5728 DSH \u9875\u9762\u4E2D\u4F7F\u7528\u4E3B\u73AF\u5883\u5B89\u88C5\u3002");
      installer.getPreview(args.previewId, "web-ui");
      return JSON.stringify(this.launch("install", async (signal, job) => {
        job.install = await installer.install(args.previewId, "web-ui", { signal, onProgress: (value) => {
          job.install = value;
        } });
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

// src/host-install.ts
import { randomUUID as randomUUID7 } from "node:crypto";
import { join as join5 } from "node:path";
var HostInstaller = class {
  constructor(manager, options) {
    this.manager = manager;
    this.options = options;
  }
  receipts = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Set();
  target() {
    const { profile, directory, runtimeVersion } = this.options;
    return { profile, directory, runtimeVersion };
  }
  getPreview(id, owner) {
    const receipt = this.receipts.get(id);
    if (!receipt || receipt.plan.owner !== owner) throw new Error("\u5B89\u88C5\u9884\u89C8\u5DF2\u5931\u6548\u6216\u5C5E\u4E8E\u5176\u4ED6\u4F1A\u8BDD\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002");
    return structuredClone(receipt.preview);
  }
  isActive(record) {
    if (record.processId === process.pid) return this.active.has(record.id);
    if (!Number.isSafeInteger(record.processId) || record.processId <= 0) return false;
    try {
      process.kill(record.processId, 0);
      return true;
    } catch (error) {
      return error.code === "EPERM";
    }
  }
  async snapshot() {
    const files = Object.fromEntries(await Promise.all(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "cordis.patch.yml"].map(async (name2) => [name2, await optionalText(join5(this.options.directory, name2))])));
    const records = await (this.options.scan?.() ?? scanProfile(this.options.directory, this.options.installAnchor));
    return { files, records, revision: digest(JSON.stringify({ files, records })) };
  }
  candidates(plan) {
    const { fingerprint, ...body } = plan;
    if (digest(JSON.stringify(body)) !== fingerprint) throw new Error("\u65B9\u6848\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u3002");
    if (plan.missing.length || plan.report.findings.some((x) => x.severity === "error")) throw new Error("\u65B9\u6848\u7F3A\u5C11\u80FD\u529B\u6216\u5B58\u5728\u517C\u5BB9\u6027\u9519\u8BEF\uFF0C\u8BF7\u5148\u8C03\u6574\u3002");
    const candidates = plan.selected.filter((x) => x.source === "npm");
    if (new Set(candidates.map((x) => x.name)).size !== candidates.length) throw new Error("\u65B9\u6848\u5305\u542B\u91CD\u590D\u7684\u63D2\u4EF6\u5305\u3002");
    for (const candidate of candidates) {
      packageName(candidate.name);
      version(candidate.version);
      if (isProtected(candidate.name)) throw new Error(`\u65B9\u6848\u4E0D\u80FD\u66FF\u6362\u5B98\u65B9\u7EC4\u4EF6\u6216\u7BA1\u7406\u63D2\u4EF6\uFF1A${candidate.name}`);
      if (!candidate.integrity || !candidate.metadataHash) throw new Error(`${candidate.name} \u7F3A\u5C11\u5236\u54C1\u4FE1\u606F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u65B9\u6848\u3002`);
    }
    return candidates;
  }
  comparison(records, selected) {
    const names = new Set(selected.map((x) => x.name));
    const baseline = new Set(checkCompatibility(records, this.options.runtimeVersion).findings.filter((x) => x.severity === "error").map((x) => JSON.stringify(x)));
    const combined = [...records.filter((x) => !names.has(x.name)), ...selected.map((x) => ({ ...x, enabled: true }))];
    const findings = checkCompatibility(combined, this.options.runtimeVersion).findings;
    return { findings, blockers: findings.filter((x) => x.severity === "error" && (x.plugins.some((name2) => names.has(name2)) || !baseline.has(JSON.stringify(x)))).map((x) => x.message) };
  }
  async preview(plan, signal) {
    const candidates = this.candidates(plan);
    const current = await this.snapshot();
    for (const candidate of candidates) {
      const fresh = await (this.options.inspect ?? inspectCandidate)(candidate.name, candidate.version, candidate.capabilities, signal);
      if (fresh.integrity !== candidate.integrity || fresh.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} \u7684\u53D1\u5E03\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u65B9\u6848\u3002`);
    }
    signal?.throwIfAborted();
    const items = candidates.map((candidate) => {
      const before = current.records.find((x) => x.name === candidate.name);
      return {
        name: candidate.name,
        version: candidate.version,
        previousVersion: before?.version,
        permissions: candidate.permissions,
        action: !before ? "install" : before.version !== candidate.version ? "replace" : before.enabled ? "reuse" : "enable"
      };
    });
    const selected = candidates.map((candidate) => {
      const before = current.records.find((x) => x.name === candidate.name && x.version === candidate.version);
      return before ?? candidateRecord(candidate);
    });
    const comparison = this.comparison(current.records, selected);
    const preview = {
      id: randomUUID7(),
      planId: plan.id,
      task: plan.task,
      target: this.target(),
      items,
      ...comparison,
      fingerprint: digest(JSON.stringify({ plan: plan.fingerprint, target: this.target(), revision: current.revision, items }))
    };
    this.receipts.set(preview.id, { preview, plan: structuredClone(plan), revision: current.revision });
    while (this.receipts.size > 30) this.receipts.delete(this.receipts.keys().next().value);
    return structuredClone(preview);
  }
  async install(previewId, owner, options = {}) {
    const receipt = this.receipts.get(previewId);
    if (!receipt || receipt.plan.owner !== owner) throw new Error("\u5B89\u88C5\u9884\u89C8\u5DF2\u5931\u6548\u6216\u5C5E\u4E8E\u5176\u4ED6\u4F1A\u8BDD\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002");
    if (receipt.preview.blockers.length) throw new Error(receipt.preview.blockers.join("\n"));
    return withLock(join5(this.options.directory, ".autocompose-install.lock"), async () => {
      if (this.receipts.get(previewId) !== receipt) throw new Error("\u8FD9\u4E2A\u5B89\u88C5\u9884\u89C8\u5DF2\u7ECF\u4F7F\u7528\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002");
      this.receipts.delete(previewId);
      options.signal?.throwIfAborted();
      let snapshot = await this.snapshot();
      if (snapshot.revision !== receipt.revision) throw new Error("\u4E3B\u73AF\u5883\u5DF2\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u5B89\u88C5\u5185\u5BB9\u3002");
      const candidates = this.candidates(receipt.plan);
      const record = {
        id: randomUUID7(),
        planId: receipt.plan.id,
        task: receipt.plan.task,
        target: this.target(),
        processId: process.pid,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        status: "running",
        stage: "checking",
        items: receipt.preview.items.map((x) => ({ ...x, state: x.action === "reuse" ? "reused" : "pending" })),
        restartRequired: false,
        warnings: []
      };
      const save = async () => {
        await writeJson(join5(this.options.root, "installations", `${record.id}.json`), record);
        try {
          options.onProgress?.(structuredClone(record));
        } catch {
        }
      };
      const ensureUnchanged = async () => {
        options.signal?.throwIfAborted();
        if ((await this.snapshot()).revision !== snapshot.revision) throw new Error("\u4E3B\u73AF\u5883\u88AB\u5176\u4ED6\u64CD\u4F5C\u4FEE\u6539\uFF0C\u540E\u7EED\u5B89\u88C5\u5DF2\u505C\u6B62\u3002\u8BF7\u91CD\u65B0\u68C0\u67E5\u3002");
      };
      const observe = (result) => {
        record.restartRequired ||= result.application === "restart-required";
        record.warnings.push(...result.warnings ?? []);
        if (result.pendingBuilds?.length) throw new Error(`\u63D2\u4EF6\u9700\u8981\u6784\u5EFA\u6388\u6743\uFF1A${result.pendingBuilds.join("\u3001")}\u3002\u8BF7\u5728 DSH \u63D2\u4EF6\u7BA1\u7406\u4E2D\u5904\u7406\u540E\u91CD\u8BD5\u3002`);
        if (!["applied", "restart-required"].includes(result.application) || result.packageResult && result.packageResult.exitCode !== 0) {
          throw new Error(result.error?.diagnostic ?? result.error?.code ?? `DSH \u672A\u5B8C\u6210\u64CD\u4F5C\uFF1A${result.application}`);
        }
      };
      this.active.add(record.id);
      try {
        await save();
        for (const candidate of candidates) {
          const fresh = await (this.options.inspect ?? inspectCandidate)(candidate.name, candidate.version, candidate.capabilities, options.signal);
          if (fresh.integrity !== candidate.integrity || fresh.metadataHash !== candidate.metadataHash) throw new Error(`${candidate.name} \u7684\u53D1\u5E03\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u65B9\u6848\u3002`);
        }
        await ensureUnchanged();
        if (record.items.some((x) => x.action !== "reuse")) {
          record.backupPath = join5(this.options.root, "install-backups", `${record.id}.json`);
          await writeJson(record.backupPath, { target: this.target(), at: record.startedAt, files: snapshot.files });
          await save();
        }
        for (const item of record.items.filter((x) => ["install", "replace"].includes(x.action))) {
          await ensureUnchanged();
          record.stage = "installing";
          record.currentPackage = item.name;
          await save();
          const requestId = randomUUID7();
          let cancelling;
          const cancel = () => {
            cancelling ??= this.manager.cancelInstall(requestId);
            void cancelling.catch(() => {
            });
          };
          const installing = this.manager.installBundle(`${item.name}@${item.version}`, { enabled: false, requestId, registry: registryUrl });
          options.signal?.addEventListener("abort", cancel, { once: true });
          if (options.signal?.aborted) cancel();
          let result;
          try {
            result = await installing;
          } finally {
            options.signal?.removeEventListener("abort", cancel);
            await cancelling;
          }
          item.application = result.application;
          snapshot = await this.snapshot();
          if (snapshot.records.some((x) => x.name === item.name && x.version === item.version)) item.state = "installed";
          await save();
          observe(result);
        }
        await ensureUnchanged();
        const installed = candidates.map((candidate) => {
          const actual = snapshot.records.find((x) => x.name === candidate.name && x.version === candidate.version);
          if (!actual || digest(JSON.stringify(packageMetadata(actual.manifest))) !== candidate.metadataHash) throw new Error(`${candidate.name} \u5B89\u88C5\u540E\u7684\u7248\u672C\u6216\u58F0\u660E\u4E0E\u65B9\u6848\u4E0D\u7B26\uFF0C\u5DF2\u505C\u6B62\u542F\u7528\u3002`);
          return actual;
        });
        const checked = this.comparison(snapshot.records, installed);
        if (checked.blockers.length) throw new Error(`\u5B89\u88C5\u540E\u68C0\u67E5\u672A\u901A\u8FC7\uFF0C\u5DF2\u505C\u6B62\u542F\u7528\uFF1A${checked.blockers.join("\uFF1B")}`);
        const ordered = [], visiting = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set();
        const visit = (item) => {
          if (visited.has(item.name)) return;
          if (visiting.has(item.name)) throw new Error("\u63D2\u4EF6\u4E4B\u95F4\u5B58\u5728\u5FAA\u73AF\u4F9D\u8D56\uFF0C\u5DF2\u505C\u6B62\u542F\u7528\u3002");
          visiting.add(item.name);
          const candidate = candidates.find((x) => x.name === item.name);
          for (const name2 of Object.keys(compatMetadata(candidate.manifest.dshCompat).requires ?? {})) {
            const dependency = record.items.find((x) => x.name === name2);
            if (dependency) visit(dependency);
          }
          visiting.delete(item.name);
          visited.add(item.name);
          ordered.push(item);
        };
        record.items.forEach(visit);
        for (const item of ordered.filter((x) => x.action !== "reuse")) {
          await ensureUnchanged();
          record.stage = "enabling";
          record.currentPackage = item.name;
          await save();
          const result = await this.manager.setBundleEnabled(item.name, true);
          item.application = result.application;
          snapshot = await this.snapshot();
          if (snapshot.records.some((x) => x.name === item.name && x.version === item.version && x.enabled)) item.state = "enabled";
          await save();
          observe(result);
          if (!snapshot.records.some((x) => x.name === item.name && x.version === item.version && x.enabled)) throw new Error(`${item.name} \u7684\u542F\u7528\u72B6\u6001\u672A\u4FDD\u5B58\u3002`);
        }
        record.status = "completed";
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        record.status = options.signal?.aborted ? "cancelled" : record.items.some((x) => ["installed", "enabled"].includes(x.state)) ? "partial" : "failed";
      } finally {
        record.stage = "finished";
        delete record.currentPackage;
        record.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
        try {
          await save();
        } finally {
          this.active.delete(record.id);
        }
      }
      return record;
    });
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
var inject = ["tools", "sandboxPolicy", "profileContext", "pluginManager"];
function apply(ctx, config = {}) {
  const root = resolve7(config.root ?? join6(process.env.DSH_HOME ?? join6(homedir(), ".dsh"), "autocompose"));
  const installAnchor = ctx.profileContext.installAnchor;
  const installer = new HostInstaller(ctx.pluginManager, {
    root,
    installAnchor,
    profile: ctx.profileContext.name,
    directory: ctx.profileContext.dir,
    runtimeVersion: getDshRuntimeVersion()
  });
  const controller = new ComposeController({ ...config, root, installAnchor, installer });
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
    description: "\u6309\u4EFB\u52A1\u9009\u62E9\u517C\u5BB9\u63D2\u4EF6\u3002\u5148 plan \u751F\u6210\u65B9\u6848\uFF1Brun \u5728\u4E34\u65F6\u73AF\u5883\u6267\u884C\u4EFB\u52A1\uFF1Binstall_preview \u7528 planId \u68C0\u67E5\u5C06\u63D2\u4EF6\u5B89\u88C5\u5230\u5F53\u524D\u4E3B\u73AF\u5883\u7684\u53D8\u66F4\uFF0C\u5C06\u8FD4\u56DE\u7684 id \u4F5C\u4E3A install \u7684 previewId\uFF0C\u6279\u51C6\u540E\u6301\u4E45\u5B89\u88C5\u5E76\u542F\u7528\u3002\u5B89\u88C5\u4E0D\u542F\u52A8\u6A21\u578B\u4EFB\u52A1\u3002\u4E3B\u73AF\u5883\u53EA\u6307\u5F53\u524D profile\u3002\u8FD0\u884C\u3001\u5B89\u88C5\u4E0E\u4FDD\u5B58\u9884\u8BBE\u9075\u5B88 DSH \u4EBA\u5DE5\u6279\u51C6\u673A\u5236\u3002",
    parameters: {
      action: { type: "string", required: true, enum: ["plan", "run", "save_preset", "discover", "install_preview", "install"] },
      task: { type: "string", description: "plan \u7684\u4EFB\u52A1\u6587\u672C\uFF1Bdiscover \u7684\u82F1\u6587\u80FD\u529B\u540D\u79F0\u3002" },
      capabilities: { type: "array", items: { type: "string" }, description: "\u53EF\u9009\uFF0C\u8986\u76D6\u89C4\u5219\u63A8\u65AD\u7684\u80FD\u529B\u5217\u8868\u3002" },
      planId: { type: "string" },
      preset: { type: "string" },
      previewId: { type: "string", description: "install_preview \u7ED3\u679C\u4E2D\u7684 id\u3002" },
      mode: { type: "string", enum: ["read-only", "workspace-write"], description: "run \u7684\u4EFB\u52A1\u76EE\u5F55\u6743\u9650\uFF0C\u9ED8\u8BA4 read-only\u3002" }
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args, exec2) {
      const signal = AbortSignal.any([exec2.signal, disposal.signal]);
      signal.throwIfAborted();
      if (args.action === "discover") return JSON.stringify(await discover(args.task ?? "", signal));
      const owner = exec2.agent?.session.id;
      if (args.action === "install") {
        const preview = installer.getPreview(args.previewId ?? "", owner);
        if (preview.blockers.length) throw new Error(preview.blockers.join("\n"));
        await approve(ctx, exec2, "install composed plugins", `\u5C06\u63D2\u4EF6\u5B89\u88C5\u5E76\u542F\u7528\u5230 ${preview.target.profile}\uFF08${preview.target.directory}\uFF09\uFF1A` + preview.items.map((x) => `${x.name}: ${x.previousVersion ?? "\u672A\u5B89\u88C5"} \u2192 ${x.version} (${x.action})`).join("\uFF1B") + `\u3002\u6743\u9650\u58F0\u660E\uFF1A${preview.items.flatMap((x) => x.permissions).join("\u3001")}\u3002\u63D2\u4EF6\u4F1A\u4FDD\u7559\uFF0C\u53EF\u80FD\u9700\u8981\u91CD\u542F DSH\u3002`);
        const promise2 = installer.install(preview.id, owner, { signal });
        running.add(promise2);
        try {
          return JSON.stringify(await promise2);
        } finally {
          running.delete(promise2);
        }
      }
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
      if (args.action === "install_preview") return JSON.stringify(await installer.preview(plan, signal));
      await approve(ctx, exec2, "autocompose operation", `${args.action}: ${plan.selected.map((x) => `${x.name}@${x.version}`).join(", ")}; \u6743\u9650 ${plan.permissions.join(", ")}; mode=${args.mode ?? "read-only"}; workspace=${plan.cwd}; plan=${plan.fingerprint}`);
      if (args.action === "save_preset") return JSON.stringify({ path: await savePreset(root, args.preset ?? "", plan) });
      const promise = runPlan(plan, {
        root,
        installAnchor,
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
