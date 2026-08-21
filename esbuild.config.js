const esbuild = require("esbuild");

const production = process.argv[2] === "production";

const buildOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  sourcemap: !production,
  minify: production
};

(async () => {
  if (production) {
    await esbuild.build(buildOptions);
  } else {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  }
})();