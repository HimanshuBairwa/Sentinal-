// Static-build wrapper: sets NEXT_STATIC_EXPORT=1, then invokes the Next
// build programmatically via its public JS API. Works identically on
// Windows/macOS/Linux (no shell env-var syntax, no cross-env dependency).
process.env.NEXT_STATIC_EXPORT = "1";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const { nextBuild } = await import("next/dist/cli/next-build.js");

const exitCode = await nextBuild(
  process.cwd(), // project dir
  undefined,     // no custom entry
  process.argv.slice(2), // pass through CLI flags
  true           // isNextDev = false → production build
);

process.exit(exitCode ?? 0);
