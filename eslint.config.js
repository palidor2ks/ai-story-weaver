import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions are Deno edge functions with their own runtime/tooling — they
  // aren't part of the browser app build and shouldn't be gated by this config.
  { ignores: ["dist", "supabase/functions/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Error in app code (typed). Admin-only internal panels stay a warning via the
      // override below, where a stale generated types.ts still forces some `any`.
      "@typescript-eslint/no-explicit-any": "error",
      // shadcn/ui generates empty interfaces that extend a supertype (e.g. TextareaProps).
      // Keep this advisory so regenerated UI components don't break the lint gate.
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  {
    // no-explicit-any stays advisory (warn) here for now:
    //  - admin/**: internal tooling that leans on Supabase tables/RPCs missing from
    //    the generated types.
    //  - the listed hooks/components: their remaining `any`s are Supabase RPC/query
    //    result rows and untyped-table client casts. Typing them correctly needs the
    //    real schema (regenerate src/integrations/supabase/types.ts) or a local build to
    //    verify, so they're deferred to a follow-up rather than typed blind.
    // Everything else in src/ is gated at "error".
    files: [
      "src/components/admin/**/*.{ts,tsx}",
      "src/pages/admin/**/*.{ts,tsx}",
      // Non-app code: build tooling and the separate Remotion video sub-project.
      "scripts/**/*.{ts,tsx}",
      "remotion/**/*.{ts,tsx}",
      // PollResults consumes a Supabase join (question_options) that the generated
      // types resolve to a SelectQueryError, so its rows can't be cleanly typed yet.
      "src/components/poll/PollResults.tsx",
      "src/pages/TopSpenders.tsx",
      "src/hooks/useCandidates.ts",
      "src/hooks/useCommitteeTopics.ts",
      "src/hooks/useDonorAliases.ts",
      "src/hooks/useDonorCauses.ts",
      "src/hooks/useDonorsPaginated.ts",
      "src/hooks/useIndependentExpenditures.ts",
      "src/hooks/usePolls.ts",
      "src/hooks/useRepComparison.ts",
      "src/hooks/useUnifiedCandidates.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
