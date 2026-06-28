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
      "src/hooks/useCommitteeTopics.ts",
      "src/hooks/useDonorAliases.ts",
      "src/hooks/useDonorsPaginated.ts",
      "src/hooks/usePolls.ts",
      "src/hooks/useRepComparison.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // One front door for data (see docs/ARCHITECTURE-AUDIT.md, Step 2): components
    // and pages must read/write through hooks in src/hooks/ (which wrap the
    // Supabase client), not import the client directly. This ratchet stops NEW
    // direct imports; the allowlist below grandfathers files that predate the rule
    // and shrinks by one entry per migration PR until it hits zero.
    files: ["src/components/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/integrations/supabase/client",
                "**/integrations/supabase/client",
              ],
              message:
                "Don't import the Supabase client in components/pages. Add or reuse a hook in src/hooks/ instead (the 'one front door' rule — see docs/ARCHITECTURE-AUDIT.md).",
            },
          ],
        },
      ],
    },
  },
  {
    // Grandfathered: files that imported the Supabase client before the ratchet
    // existed. Migrate one per PR (extract its queries into src/hooks/) and delete
    // its entry here. When this list is empty, the front-door migration is done.
    files: [
      "src/components/AIExplanation.tsx",
      "src/components/AIFeedback.tsx",
      "src/components/AddressAutocomplete.tsx",
      "src/components/AvatarUpload.tsx",
      "src/components/BadgeAwardToast.tsx",
      "src/components/BillAIAnalysisDialog.tsx",
      "src/components/CandidatePositions.tsx",
      "src/components/ChangePasswordDialog.tsx",
      "src/components/DonorAIAnalysisDialog.tsx",
      "src/components/PartyComparisonCard.tsx",
      "src/components/PositionsMatchList.tsx",
      "src/components/RecipientAIAnalysisDialog.tsx",
      "src/components/RepresentativeComparisonCard.tsx",
      "src/components/ShareProfileButton.tsx",
      "src/components/VerificationBadges.tsx",
      "src/components/admin/AdminUserDetailDialog.tsx",
      "src/components/admin/AdminUsersPanel.tsx",
      "src/components/admin/AnswerCoveragePanel.tsx",
      "src/components/admin/BackfillAnswersControl.tsx",
      "src/components/admin/BillSummaryDashboard.tsx",
      "src/components/admin/BulkAnswerValidation.tsx",
      "src/components/admin/BulkCommitteeTotalsCard.tsx",
      "src/components/admin/BulkDonorSyncCard.tsx",
      "src/components/admin/CandidateAnswersDialog.tsx",
      "src/components/admin/CandidateAnswersPopover.tsx",
      "src/components/admin/CivicOfficialsPanel.tsx",
      "src/components/admin/CommitteeAliasesPanel.tsx",
      "src/components/admin/CommitteeBreakdown.tsx",
      "src/components/admin/CommitteeTopicsPanel.tsx",
      "src/components/admin/DonorAliasesPanel.tsx",
      "src/components/admin/DonorImportHistory.tsx",
      "src/components/admin/DonorImportPanel.tsx",
      "src/components/admin/DuplicatePersonsPanel.tsx",
      "src/components/admin/HiddenStatesPanel.tsx",
      "src/components/admin/IndependentExpenditureApiFetchCard.tsx",
      "src/components/admin/IndependentExpenditureImportCard.tsx",
      "src/components/admin/IndependentExpenditureImportHistory.tsx",
      "src/components/admin/IngestStatusPanel.tsx",
      "src/components/admin/LocalOfficialsImportPanel.tsx",
      "src/components/admin/QuestionManagementPanel.tsx",
      "src/components/admin/TopicReviewPanel.tsx",
      "src/components/admin/VendorRefundsPanel.tsx",
      "src/pages/Admin.tsx",
      "src/pages/AdminUserProfileView.tsx",
      "src/pages/Committees.tsx",
      "src/pages/DonorProfile.tsx",
      "src/pages/Feed.tsx",
      "src/pages/Issues.tsx",
      "src/pages/PartyProfile.tsx",
      "src/pages/PoliticianDashboard.tsx",
      "src/pages/Poll.tsx",
      "src/pages/Quiz.tsx",
      "src/pages/QuizLibrary.tsx",
      "src/pages/QuizResults.tsx",
      "src/pages/Unsubscribe.tsx",
      "src/pages/UserProfile.tsx",
      "src/pages/VerifyEmail.tsx",
      "src/pages/admin/SocialComposer.tsx",
      "src/pages/admin/SocialHandles.tsx",
      "src/pages/admin/SocialPosts.tsx",
      "src/pages/admin/TikTokConnect.tsx",
      "src/pages/admin/TikTokConnectCallback.tsx",
      "src/pages/admin/XComposer.tsx",
      "src/pages/admin/XConnectCallback.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
