// The subset of the hvigor plugin API this plugin uses. It is declared here rather than imported
// from `@ohos/hvigor` and `@ohos/hvigor-ohos-plugin`, which are only available from Huawei's
// registry and come without a license that would allow depending on them.

export interface HvigorNode {
  getNodeName(): string;
  getParentNode(): HvigorNode | undefined;
  getContext(pluginId: string): unknown;
  registerTask(task: HvigorTask): void;
}

export interface HvigorTask {
  name: string;
  run(): void | Promise<void>;
  dependencies?: string[];
  /** Tasks that may only run after this one, which also pulls this task into their build. */
  postDependencies?: string[];
}

export interface HvigorPlugin {
  pluginId: string;
  apply(node: HvigorNode): void | Promise<void>;
}

export const OHOS_APP_PLUGIN = 'com.ohos.app';
export const OHOS_MODULE_PLUGINS = ['com.ohos.hap', 'com.ohos.hsp', 'com.ohos.har'];

export interface OhosModuleContext {
  getModuleName(): string;
  getModulePath(): string;
  getBuildMode(): string;
  targets(callback: (target: OhosTarget) => void): void;
  getBuildProfileOpt(): {
    buildOption?: { externalNativeOptions?: { abiFilters?: string[] } };
  };
}

export interface OhosTarget {
  getTargetName(): string;
}

export interface OhosAppContext {
  getSdkDetails?(): { getSdkDir(): string; getSdkVersion(): number };
}
