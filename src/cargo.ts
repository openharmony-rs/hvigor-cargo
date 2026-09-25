import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';

/** The `cargo ohos env --format json` schema this plugin understands. */
const CARGO_OHOS_SCHEMA_VERSION = 1;

export const ABI_TRIPLES: Record<string, string> = {
  'arm64-v8a': 'aarch64-unknown-linux-ohos',
  'armeabi-v7a': 'armv7-unknown-linux-ohos',
  x86_64: 'x86_64-unknown-linux-ohos',
};

export type Env = Record<string, string | undefined>;

interface OhosEnv {
  cargo_ohos_version: string;
  schema_version: number;
  env: Record<string, string>;
  runtime_libraries: { kind: string; path: string; soname: string }[];
  sdk: { native_root: string; version: string; api_version: number | null };
}

export interface CargoInvocation {
  manifestPath: string;
  command: string;
  triple: string;
  profile: string;
  features: string[];
  cargoArgs: string[];
  ohosArgs: string[];
  sdk?: string;
  env: Env;
}

/** Shared libraries to package, keyed by the file name they must have in the HAP. */
export type Libraries = Map<string, string>;

export async function buildLibraries(inv: CargoInvocation): Promise<Libraries> {
  const env = withCargoBin(inv.env);
  const ohos = await ohosEnv(inv, env);
  console.log(
    `cargo-ohos ${ohos.cargo_ohos_version}: SDK ${ohos.sdk.version} (API ${ohos.sdk.api_version}) ` +
      `at ${ohos.sdk.native_root}`,
  );

  const args = [
    inv.command,
    '--target',
    inv.triple,
    '--manifest-path',
    inv.manifestPath,
    '--profile',
    inv.profile,
    '--message-format=json-render-diagnostics',
  ];
  if (inv.features.length > 0) {
    args.push('--features', inv.features.join(','));
  }
  args.push(...inv.cargoArgs);

  const libraries: Libraries = new Map();
  await run(findTool('cargo', env), args, cwd(inv), { ...env, ...ohos.env }, (line) => {
    const artifact = parseArtifact(line);
    if (artifact === undefined) {
      console.log(line);
      return;
    }
    for (const file of artifact) {
      libraries.set(path.basename(file), file);
    }
  });
  for (const lib of ohos.runtime_libraries) {
    libraries.set(lib.soname, lib.path);
  }
  return libraries;
}

async function ohosEnv(inv: CargoInvocation, env: Env): Promise<OhosEnv> {
  const args = ['ohos', 'env', '--format', 'json', '--target', inv.triple];
  if (inv.sdk !== undefined) {
    args.push('--sdk', inv.sdk);
  }
  args.push(...inv.ohosArgs);
  let json = '';
  await run(findTool('cargo-ohos', env), args, cwd(inv), env, (line) => {
    json += line;
  });
  const parsed = JSON.parse(json) as OhosEnv;
  if (parsed.schema_version !== CARGO_OHOS_SCHEMA_VERSION) {
    throw new Error(
      `cargo-ohos ${parsed.cargo_ohos_version} emits schema version ${parsed.schema_version}, ` +
        `but this plugin needs schema version ${CARGO_OHOS_SCHEMA_VERSION}`,
    );
  }
  return parsed;
}

/**
 * Returns the shared libraries of a `compiler-artifact` message, an empty list for other cargo
 * messages, and `undefined` for lines that are not cargo JSON messages.
 */
function parseArtifact(line: string): string[] | undefined {
  if (!line.startsWith('{')) {
    return undefined;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (message.reason !== 'compiler-artifact') {
    return [];
  }
  const kinds: string[] = message.target?.kind ?? [];
  if (kinds.includes('proc-macro') || kinds.includes('custom-build')) {
    return [];
  }
  return (message.filenames as string[]).filter((file) => file.endsWith('.so'));
}

/**
 * Cargo reads `.cargo/config.toml` relative to the working directory, and cargo-ohos locates the
 * target directory through a `cargo metadata` call that ignores `--manifest-path`.
 */
function cwd(inv: CargoInvocation): string {
  return path.dirname(inv.manifestPath);
}

/** DevEco Studio started from a desktop launcher does not see the PATH set up by rustup. */
function withCargoBin(env: Env): Env {
  const cargoBin = path.join(env.CARGO_HOME ?? path.join(os.homedir(), '.cargo'), 'bin');
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const entries = (env[key] ?? '').split(path.delimiter).filter((e) => e !== '');
  if (!entries.includes(cargoBin)) {
    entries.push(cargoBin);
  }
  return { ...env, [key]: entries.join(path.delimiter) };
}

function findTool(name: string, env: Env): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  for (const dir of (env[key] ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, exe);
    if (dir !== '' && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const hint = name === 'cargo-ohos' ? 'cargo install cargo-ohos' : 'https://rustup.rs';
  throw new Error(`Could not find \`${name}\` in PATH or the cargo home directory (${hint})`);
}

/** Runs `program`, passing each stdout line to `onLine` and forwarding stderr to the console. */
function run(
  program: string,
  args: string[],
  cwd: string,
  env: Env,
  onLine: (line: string) => void,
): Promise<void> {
  console.log(`Running ${program} ${args.join(' ')} in ${cwd}`);
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    readline.createInterface({ input: child.stdout }).on('line', onLine);
    readline.createInterface({ input: child.stderr }).on('line', (line) => console.error(line));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(program)} ${args[0]} failed (${signal ?? `exit code ${code}`})`));
      }
    });
  });
}
