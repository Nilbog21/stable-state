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
  // #1222's fence. The app has two date frames — a real instant rendered in the barn's zone
  // (via the `Instant` brand and `format-date.ts`'s formatters), and zoneless "YYYY-MM-DD"
  // calendar arithmetic. Neither is the *host's* zone, but every API below silently reads it,
  // which is how fourteen timezone bugs got in. Only the date modules may call them.
  //
  // Note what is deliberately NOT banned: a bare `new Date()`, or `new Date(msOrIsoString)`.
  // Comparing two instants, or stamping `now` into a TIMESTAMPTZ, is zone-free and correct —
  // the bug is always reading or writing a *calendar field* against the host's clock. Reading
  // is what the getters below do; writing is the multi-argument `new Date(y, m, d, h, min)`
  // constructor, which is banned for the same reason and caught by argument count. It reads
  // no getter, so the getter rule couldn't see it — which is how `ExpenseForm` kept anchoring
  // expense entry to the viewer's zone after every other entry path had moved.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: [
      "src/lib/format-date.ts",
      "src/lib/format-expense.ts",
      "src/lib/local-day.ts",
      "src/lib/barn-timezone.ts",
      "src/lib/finances-month.ts",
      // Formats numbers, not dates — the AC calls this out explicitly.
      "src/lib/format-currency.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error",
        {
          selector: "CallExpression > MemberExpression[property.name=/^toLocale(Date|Time)?String$/]",
          message: "Renders in the host's timezone. Use format-date.ts's formatBarnDateTime/formatBarnDate/formatBarnTime on an Instant, or formatShortDate for a DATE-only value (#1222).",
        },
        {
          selector: "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat'], CallExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message: "Defaults to the host's timezone. Format dates through src/lib/format-date.ts, which carries the barn's zone on the Instant (#1222).",
        },
        {
          selector: "MemberExpression[property.name=/^get(Hours|Minutes|Seconds|Date|Month|FullYear|Day)$/]",
          message: "Reads the calendar field in the host's timezone. Resolve barn-local via barn-timezone.ts's instantToLocalWallClock/barnToday instead (#1222).",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length>1]",
          message: "Interprets the calendar components in the host's timezone. Build the instant from a barn-local wall clock via barn-timezone.ts's wallClockToInstant instead (#1222).",
        },
      ],
    },
  },
  // Honor the `_`-prefix convention for intentionally-unused args/vars
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
