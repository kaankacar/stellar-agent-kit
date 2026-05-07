import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    plugins: "src/plugins.ts",
    runner: "src/runner.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
});
