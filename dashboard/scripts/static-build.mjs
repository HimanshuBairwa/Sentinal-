// Static-build wrapper: sets NEXT_STATIC_EXPORT=1, then invokes Next's
// build engine (the exact function the `next build` CLI calls internally).
// Cross-platform (Windows/macOS/Linux) — no shell env-var syntax needed.
process.env.NEXT_STATIC_EXPORT = "1";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const mod = await import("next/dist/build/index.js");
// CJS interop: the module's default export is a namespace object whose
// .default is the actual build() function (Next's own CLI does the same).
const build = mod.default?.default ?? mod.default;
const path = await import("node:path");

const projectDir = path.resolve(process.cwd());

try {
  await build(projectDir, false /* experimentalAnalyze */, false /* profile */);
  process.exit(0);
} catch (err) {
  console.error("> Build error occurred");
  console.error(err);
  process.exit(1);
}
