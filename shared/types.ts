export interface CompatMetadata {
  dsh?: string;
  capabilities?: string[];
  conflicts?: Record<string, string>;
  requires?: Record<string, string>;
  services?: string[];
  tools?: string[];
  permissions?: string[];
  platforms?: string[];
  priority?: number;
}

export interface PackageManifest {
  name?: string;
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  engines?: { node?: string };
  os?: string[];
  dsh?: { bundle?: { patch: string | string[] }; profile?: { bundles: string[] } };
  dshCompat?: CompatMetadata;
  [key: string]: unknown;
}

export interface PluginRecord {
  name: string;
  version: string;
  enabled: boolean;
  removable: boolean;
  protected: boolean;
  manifest: PackageManifest;
  directory?: string;
  rowIds: string[];
  /** A repeated declaration, not an intentional id-only override. */
  duplicateRowIds?: string[];
  state?: 'active' | 'failed' | 'pending' | 'disabled';
  loadError?: string;
}

export interface Finding {
  code: 'dsh-version' | 'node-version' | 'platform' | 'missing-dependency' | 'dependency-version'
    | 'declared-conflict' | 'duplicate-row' | 'duplicate-service' | 'duplicate-tool'
    | 'load-failure' | 'invalid-metadata' | 'unknown-compatibility' | 'embedded-runtime';
  severity: 'error' | 'warning';
  plugins: string[];
  message: string;
}

export interface CompatibilityReport {
  runtimeVersion: string;
  findings: Finding[];
  quarantine: string[];
  unresolved: Finding[];
}

export const protectedNames = new Set(['dsh-compat-guardian', 'dsh-autocompose']);
export function isProtected(name: string): boolean {
  return name.startsWith('@deepseek-ai/') || protectedNames.has(name);
}
