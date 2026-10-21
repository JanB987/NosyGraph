import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

// Reproduce the compatibility and code-safety findings from the plugin review.
export default [{
  files: ["src/**/*.ts"],
  ignores: ["src/**/*.test.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname }
  },
  plugins: { "@typescript-eslint": tseslint.plugin, obsidianmd },
  linterOptions: { reportUnusedDisableDirectives: "off" },
  rules: {
    "obsidianmd/no-unsupported-api": "error",
    "obsidianmd/prefer-create-el": "error",
    "obsidianmd/editor-drop-paste": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/no-deprecated": "error",
    "no-alert": "error"
  }
}];
