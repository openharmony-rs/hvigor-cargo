import * as fs from 'node:fs';
import * as path from 'node:path';
import { ABI_TRIPLES, buildLibraries, Libraries } from './cargo';
import {
  HvigorNode,
  HvigorPlugin,
  OHOS_APP_PLUGIN,
  OHOS_MODULE_PLUGINS,
  OhosAppContext,
  OhosModuleContext,
} from './hvigor';

export interface CargoPluginOptions {
  /** `Cargo.toml` of the crate to build, relative to the module directory. */
  manifestPath: string;
  /**
   * The cargo subcommand, `build` by default. `rustc` with `cargoArgs: ['--lib', '--crate-type=cdylib']`
   * builds a library that does not declare the `cdylib` crate type.
   */
  command?: 'build' | 'rustc';
  /** Arguments appended to the cargo command line, e.g. `['-p', 'foo']`. */
  cargoArgs?: string[];
  /** Arguments for `cargo ohos env`, e.g. `['--download-prebuilt=19']`. */
  ohosArgs?: string[];
  features?: string[];
  /** Cargo profile per hvigor build mode. By default `debug` builds `dev` and every other mode `release`. */
  profiles?: Record<string, string>;
  /** ABIs to build. Defaults to the module's `externalNativeOptions.abiFilters`, or `arm64-v8a`. */
  abis?: string[];
  /** Environment variables for cargo-ohos and cargo, on top of hvigor's environment. */
  env?: Record<string, string>;
  /** `native` directory of the OpenHarmony SDK. Defaults to the SDK hvigor builds the app with. */
  sdk?: string;
}

/**
 * Builds a Rust crate for every ABI of the module and puts the resulting shared libraries into the
 * module's `libs/<abi>` directory, from where hvigor packages them like prebuilt native libraries.
 */
export function cargoPlugin(options: CargoPluginOptions): HvigorPlugin {
  return {
    pluginId: 'org.openharmony-rs.cargo',
    apply(node: HvigorNode) {
      // hvigor ignores `postDependencies` given as a function, despite what its typings say.
      node.registerTask({
        name: 'CargoBuild',
        postDependencies: targetNames(moduleContext(node)).map((target) => `${target}@ProcessLibs`),
        run: () => build(node, options),
      });
    },
  };
}

async function build(node: HvigorNode, options: CargoPluginOptions): Promise<void> {
  const module = moduleContext(node);
  const moduleDir = module.getModulePath();
  const buildMode = module.getBuildMode();
  const abis = options.abis ??
    module.getBuildProfileOpt().buildOption?.externalNativeOptions?.abiFilters ?? ['arm64-v8a'];
  for (const abi of abis) {
    const triple = ABI_TRIPLES[abi];
    if (triple === undefined) {
      throw new Error(`hvigor-cargo: unsupported ABI \`${abi}\``);
    }
    const libraries = await buildLibraries({
      manifestPath: path.resolve(moduleDir, options.manifestPath),
      command: options.command ?? 'build',
      triple,
      profile: options.profiles?.[buildMode] ?? (buildMode === 'debug' ? 'dev' : 'release'),
      features: options.features ?? [],
      cargoArgs: options.cargoArgs ?? [],
      ohosArgs: options.ohosArgs ?? [],
      sdk: options.sdk ?? hvigorSdk(node),
      env: { ...process.env, ...options.env },
    });
    if (libraries.size === 0) {
      throw new Error(`hvigor-cargo: cargo built no shared library from ${options.manifestPath}`);
    }
    install(libraries, path.join(moduleDir, 'libs', abi), path.join(moduleDir, 'build', 'hvigor-cargo', `${abi}.json`));
  }
}

/**
 * Copies `libraries` into `libsDir` and removes the libraries a previous build installed that are
 * gone now. Unchanged libraries are not copied again, which keeps hvigor's ProcessLibs up to date.
 */
function install(libraries: Libraries, libsDir: string, stateFile: string): void {
  let previous: string[] = [];
  if (fs.existsSync(stateFile)) {
    previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }
  fs.mkdirSync(libsDir, { recursive: true });
  for (const name of previous) {
    if (!libraries.has(name)) {
      fs.rmSync(path.join(libsDir, name), { force: true });
    }
  }
  for (const [name, source] of libraries) {
    const dest = path.join(libsDir, name);
    const src = fs.statSync(source);
    const dst = fs.existsSync(dest) ? fs.statSync(dest) : undefined;
    if (dst === undefined || dst.size !== src.size || dst.mtimeMs < src.mtimeMs) {
      console.log(`Installing ${source} as ${dest}`);
      // ProcessLibs hard-links these files into its output, which must not change underneath it.
      fs.rmSync(dest, { force: true });
      fs.copyFileSync(source, dest);
    }
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify([...libraries.keys()]));
}

function moduleContext(node: HvigorNode): OhosModuleContext {
  for (const id of OHOS_MODULE_PLUGINS) {
    const context = node.getContext(id);
    if (context !== undefined && context !== null) {
      return context as OhosModuleContext;
    }
  }
  throw new Error(`hvigor-cargo: ${node.getNodeName()} is not a HAP, HSP or HAR module`);
}

function targetNames(module: OhosModuleContext): string[] {
  const names: string[] = [];
  module.targets((target) => names.push(target.getTargetName()));
  return names;
}

/**
 * The `native` directory of the SDK hvigor compiles the app with. For OpenHarmony products that is
 * `<OHOS_BASE_SDK_HOME>/<compileSdkVersion>`, for HarmonyOS products the `default/openharmony`
 * directory of the HarmonyOS SDK.
 */
function hvigorSdk(node: HvigorNode): string | undefined {
  let root = node;
  for (let parent = node.getParentNode(); parent !== undefined; parent = parent.getParentNode()) {
    root = parent;
  }
  const sdk = (root.getContext(OHOS_APP_PLUGIN) as OhosAppContext | undefined)?.getSdkDetails?.();
  if (sdk === undefined) {
    return undefined;
  }
  const dir = sdk.getSdkDir();
  return [
    path.join(dir, String(sdk.getSdkVersion()), 'native'),
    path.join(dir, 'default', 'openharmony', 'native'),
    path.join(dir, 'openharmony', 'native'),
    path.join(dir, 'native'),
  ].find((native) => fs.existsSync(path.join(native, 'sysroot')));
}
