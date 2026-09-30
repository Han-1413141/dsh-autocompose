import semver from 'semver';
import type { CompatMetadata } from './types.ts';

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}
export function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  return value;
}
export function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every(x => typeof x === 'string' && x.length > 0)) throw new Error(`${label} 必须是字符串数组`);
  return value as string[];
}
export function packageName(value: string): string {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value) || value.length > 214) throw new Error(`无效的包名：${value}`);
  return value;
}
export function version(value: string): string {
  if (!semver.valid(value)) throw new Error(`需要精确版本号：${value}`);
  return value;
}
export function compatMetadata(value: unknown): CompatMetadata {
  if (value === undefined) return {};
  const data = object(value, 'dshCompat');
  const out: CompatMetadata = {};
  for (const key of ['capabilities', 'services', 'tools', 'permissions', 'platforms'] as const) {
    if (data[key] !== undefined) out[key] = strings(data[key], `dshCompat.${key}`);
  }
  if (data.dsh !== undefined) {
    out.dsh = string(data.dsh, 'dshCompat.dsh');
    if (!semver.validRange(out.dsh)) throw new Error('dshCompat.dsh 版本范围无效');
  }
  for (const key of ['requires', 'conflicts'] as const) {
    if (data[key] === undefined) continue;
    out[key] = {};
    for (const [name, range] of Object.entries(object(data[key], key))) {
      packageName(name);
      const rule = string(range, `${key}.${name}`);
      if (!semver.validRange(rule)) throw new Error(`${key}.${name} 版本范围无效`);
      out[key]![name] = rule;
    }
  }
  if (data.priority !== undefined) {
    if (typeof data.priority !== 'number' || !Number.isFinite(data.priority)) throw new Error('priority 必须是有限数值');
    out.priority = data.priority;
  }
  return out;
}
