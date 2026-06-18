import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated output — not source code
    "coverage/**",
  ]),
  // Test files use `any` heavily in mock boilerplate — not worth enforcing there
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "src/test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // CommonJS require() is intentional in this Node.js script
  {
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
