# hvigor-cargo

An [hvigor] plugin that builds Rust crates with [cargo-ohos] as part of an OpenHarmony or HarmonyOS
app build, so a DevEco Studio project compiles its Rust code on every build and packages the
resulting shared libraries into the HAP, HSP or HAR.

## Usage

Declare the plugin in `hvigor/hvigor-config.json5`:

```json5
{
  "dependencies": {
    "@openharmony-rs/hvigor-cargo": "0.1.0"
  }
}
```

and apply it to the module that should contain the libraries, in its `hvigorfile.ts`:

```ts
import { hapTasks } from '@ohos/hvigor-ohos-plugin';
import { cargoPlugin } from '@openharmony-rs/hvigor-cargo';

export default {
  system: hapTasks,
  plugins: [cargoPlugin({ manifestPath: '../rust/Cargo.toml' })]
}
```

Add the module's `libs/` directory to `.gitignore`. [`examples/hello`](examples/hello) is a complete
project with an ArkTS page calling a Rust Node-API module.

Rust and cargo-ohos have to be installed separately:

```sh
rustup target add aarch64-unknown-linux-ohos x86_64-unknown-linux-ohos
cargo install cargo-ohos
```

## Options

| Option         | Default                                          | Meaning                                                                                |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `manifestPath` | required                                         | `Cargo.toml` of the crate, relative to the module directory.                           |
| `command`      | `build`                                          | `rustc` with `cargoArgs: ['--lib', '--crate-type=cdylib']` builds a crate as a cdylib. |
| `cargoArgs`    | `[]`                                             | Extra cargo arguments, e.g. `['-p', 'foo']`.                                           |
| `ohosArgs`     | `[]`                                             | Extra `cargo ohos env` arguments, e.g. `['--download-prebuilt=19']`.                   |
| `features`     | `[]`                                             | Cargo features.                                                                        |
| `profiles`     | `debug` → `dev`, other build modes → `release`   | Cargo profile per hvigor build mode.                                                   |
| `abis`         | `externalNativeOptions.abiFilters`, `arm64-v8a`  | ABIs to build.                                                                         |
| `env`          | `{}`                                             | Environment variables for cargo-ohos and cargo.                                        |
| `sdk`          | the SDK hvigor compiles the app with             | `native` directory of the OpenHarmony SDK.                                             |

## How it works

The plugin registers a `CargoBuild` task that runs before `<target>@ProcessLibs` of every target of
the module. For each ABI it asks `cargo ohos env --format json` for the cross-compilation
environment, runs cargo in it with `--message-format=json-render-diagnostics` and takes the shared
libraries from cargo's `compiler-artifact` messages. Those, plus any runtime library cargo-ohos says
must be shipped (such as `libc++.so` from an external LLVM), are copied into `libs/<abi>/`, where
hvigor picks up prebuilt libraries. Libraries are only copied when they changed, so hvigor's
packaging tasks stay up to date when cargo had nothing to do, and libraries a previous build
installed but the current one no longer produces are removed again.

The SDK is the one hvigor itself resolved for the product: `<OHOS_BASE_SDK_HOME>/<compileSdkVersion>`
for OpenHarmony products, the `openharmony` part of the HarmonyOS SDK otherwise.

Keep ArkTS type declarations for the library outside `src/main/cpp`, or hvigor runs its CMake build
and fails because there is no `CMakeLists.txt`.

## Releasing

Bump the version with `npm version --no-git-tag-version <version>` and merge the change into
`main`. The `Release` workflow then packs the package and, in the `release` environment, tags the
commit as `<version>`, stages the package on npm with trusted publishing and publishes the GitHub
release with the package attached. Publish the staged package with `npm stage approve <stage-id>`
(`npm stage list` shows the id) or on npmjs.com, which asks for 2FA. If a release did not complete,
run the `Release` workflow manually for its tag to finish it.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT)
at your option.

[hvigor]: https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-hvigor
[cargo-ohos]: https://github.com/openharmony-rs/cargo-ohos
