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
      // Advisory rather than blocking: the app has ~60 pre-existing `any`s. Keeping this
      // a warning surfaces them (and new ones) without failing CI. Tighten to "error"
      // once they're typed.
      "@typescript-eslint/no-explicit-any": "warn",
      // shadcn/ui generates empty interfaces that extend a supertype (e.g. TextareaProps).
      // Keep this advisory so regenerated UI components don't break the lint gate.
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
);
