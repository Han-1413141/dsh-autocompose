import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
const revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
const spec = process.argv[2] ?? `git+${pathToFileURL(repo).href}#${revision}`;
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const root = await mkdtemp(join(tmpdir(), 'dsh-git-install-'));
const profile = join(root, 'home', 'profiles', 'web');
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_PRIMARY_RUNTIME: '',
  DSH_TELEMETRY_DISABLED: '1', npm_config_store_dir: join(root, 'store') };
delete env.DEEPSEEK_API_KEY;
delete env.NPM_TOKEN;
delete env.NODE_AUTH_TOKEN;

try {
  await mkdir(profile, { recursive: true });
  // No build permissions and no --ignore-scripts escape hatch: exercise the Git fetcher.
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'git-install-smoke', private: true }));
  await writeFile(join(profile, 'pnpm-workspace.yaml'),
    'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\nallowBuilds: {}\n');
  const result = await exec(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', spec],
    { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 2 ** 20 });
  const packageRoot = join(profile, 'node_modules', pkg.name);
  const installed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(installed.name, pkg.name);
  assert.equal(installed.version, pkg.version);
  for (const hook of ['prepare', 'prepack', 'preinstall', 'install', 'postinstall']) {
    assert(!installed.scripts?.[hook], `Unexpected install lifecycle: ${hook}`);
  }
  const files = [installed.main, ...Object.values(installed.exports), ...Object.values(installed.bin), installed.dsh.bundle.patch];
  for (const file of new Set(files)) {
    assert.equal((await stat(join(packageRoot, file))).isFile(), true, `Missing entry point: ${file}`);
    // Compare the actual installed payload with the reviewed build, not just filenames.
    const hash = content => createHash('sha256').update(content).digest('hex');
    assert.equal(hash(await readFile(join(packageRoot, file))), hash(await readFile(join(repo, file))), file);
  }
  const help = await exec(process.execPath, [join(packageRoot, installed.bin[pkg.name]), '--help'],
    { cwd: root, env, windowsHide: true, timeout: 30000 });
  assert(help.stdout.includes(pkg.name), 'Packaged CLI must load and print its help');
  assert(!result.stderr.includes('GIT_DEP_PREPARE_NOT_ALLOWED'), result.stderr);
  console.log(`${pkg.name}@${pkg.version}: Git install passed with an empty build allowlist; all entry points match and the CLI loads.`);
} catch (error) {
  if (error.stdout) console.error(error.stdout);
  if (error.stderr) console.error(error.stderr);
  throw error;
} finally {
  const actual = await realpath(root);
  const temp = await realpath(tmpdir());
  const tail = relative(temp, actual);
  assert(tail.startsWith('dsh-git-install-') && !tail.includes(sep) && !tail.startsWith('..'), actual);
  await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
