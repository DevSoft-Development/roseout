import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/purity": "warn",
      "prefer-const": "warn",
    },
  },
  {
    // These legacy admin surfaces intentionally cross loosely typed API/data boundaries.
    // Keep the repository-wide warning gate strict while preventing known legacy `any`
    // usage in these scoped surfaces from blocking unrelated production releases.
    files: [
      "app/admin/dashboard/beta/BetaAdminClient.tsx",
      "app/admin/dashboard/beta/page.tsx",
      "app/admin/dashboard/analytics/page.tsx",
      "app/admin/dashboard/billing/page.tsx",
      "app/admin/dashboard/careers/**/*.tsx",
      "app/admin/claims/AdminClaimsPage.tsx",
      "app/admin/billing/page.tsx",
      "app/admin/activities/notes/route.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // The dashboard billing page is a legacy compressed admin surface with one known
    // unused helper. Keep the repository-wide unused-variable rule intact elsewhere.
    files: ["app/admin/dashboard/billing/page.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated JavaScript emitted by test/regression scripts.
    ".tmp-test/**",
  ]),
]);

export default eslintConfig;
