import { hapTasks } from '@ohos/hvigor-ohos-plugin';
import { cargoPlugin } from '@openharmony-rs/hvigor-cargo';

export default {
  system: hapTasks,
  plugins: [cargoPlugin({ manifestPath: '../rust/Cargo.toml' })]
}
