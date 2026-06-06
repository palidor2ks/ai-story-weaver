import { Component, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { UserProvider } from "./context/UserContext";
import { useHasCompletedOnboarding } from "./hooks/useProfile";
import { LoadingScreen } from "./components/LoadingScreen";
import { BadgeAwardToast } from "./components/BadgeAwardToast";

const Auth = lazy(() => import("./pages/Auth").then((m) => ({ default: m.Auth })));
const Candidates = lazy(() => import("./pages/Candidates").then((m) => ({ default: m.Candidates })));
const Donors = lazy(() => import("./pages/Donors").then((m) => ({ default: m.Donors })));
const CandidateProfile = lazy(() => import("./pages/CandidateProfile").then((m) => ({ default: m.CandidateProfile })));
const UserProfile = lazy(() => import("./pages/UserProfile").then((m) => ({ default: m.UserProfile })));
const Quiz = lazy(() => import("./pages/Quiz").then((m) => ({ default: m.Quiz })));
const QuizResults = lazy(() => import("./pages/QuizResults").then((m) => ({ default: m.QuizResults })));
const Parties = lazy(() => import("./pages/Parties"));
const PartyProfile = lazy(() => import("./pages/PartyProfile"));
const DonorProfile = lazy(() => import("./pages/DonorProfile"));
const QuizLibrary = lazy(() => import("./pages/QuizLibrary").then((m) => ({ default: m.QuizLibrary })));
const HowScoringWorks = lazy(() => import("./pages/HowScoringWorks").then((m) => ({ default: m.HowScoringWorks })));
const Admin = lazy(() => import("./pages/Admin"));
const AdminUserProfileView = lazy(() => import("./pages/AdminUserProfileView"));
const PoliticianDashboard = lazy(() => import("./pages/PoliticianDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Committees = lazy(() => import("./pages/Committees").then((m) => ({ default: m.Committees })));
const CommitteeProfile = lazy(() => import("./pages/CommitteeProfile").then((m) => ({ default: m.CommitteeProfile })));
const Blog = lazy(() => import("./pages/Blog"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const Poll = lazy(() => import("./pages/Poll"));
const PollResultsPage = lazy(() => import("./pages/PollResultsPage"));
const TopSpenders = lazy(() => import("./pages/TopSpenders"));
const XComposer = lazy(() => import("./pages/admin/XComposer"));
const XConnectCallback = lazy(() => import("./pages/admin/XConnectCallback"));
const TikTokConnect = lazy(() => import("./pages/admin/TikTokConnect"));
const TikTokConnectCallback = lazy(() => import("./pages/admin/TikTokConnectCallback"));
const SocialComposer = lazy(() => import("./pages/admin/SocialComposer"));
const SocialHandles = lazy(() => import("./pages/admin/SocialHandles"));
const StatCardRender = lazy(() => import("./pages/StatCardRender"));
const SocialPosts = lazy(() => import("./pages/admin/SocialPosts"));
const Onboarding = lazy(() => import("./pages/Onboarding").then((m) => ({ default: m.Onboarding })));

// Root route: route users based on auth + onboarding status
const RootRedirect = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();
  if (authLoading || (user && onboardingLoading)) return <LoadingScreen />;
  if (!user) return <Navigate to="/candidates" replace />;
  if (!hasCompleted) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/profile" replace />;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireOnboarding?: boolean;
  requireVerifiedEmail?: boolean;
}

const isLazyImportError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError/i.test(message);
};

class ChunkErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (!isLazyImportError(error)) return;

    const retryKey = `polipulse:chunk-reload:${window.location.pathname}`;
    if (!sessionStorage.getItem(retryKey)) {
      sessionStorage.setItem(retryKey, "1");
      window.location.reload();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <section className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Refresh needed</h1>
          <p className="text-muted-foreground">A new version is available. Refresh to continue.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Refresh
          </button>
        </section>
      </main>
    );
  }
}

const RouteGuard = ({ children, requireAuth = true, requireOnboarding = false, requireVerifiedEmail = true }: RouteGuardProps) => {
  const { user, loading: authLoading } = useAuth();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();
  // Public routes (requireAuth=false) have no auth-dependent redirect, so render them
  // immediately instead of waiting on the auth session round-trip. Auth-gated routes still
  // wait so we don't flash protected content or redirect prematurely.
  const isLoading = requireAuth && (authLoading || (requireOnboarding && onboardingLoading));

  if (isLoading) return <LoadingScreen />;
  if (requireAuth && !user) return <Navigate to="/auth" replace />;
  if (requireAuth && requireVerifiedEmail && user && !user.email_confirmed_at) return <Navigate to="/verify-email" replace />;
  if (requireOnboarding && !hasCompleted) return <Navigate to="/" replace />;

  return <>{children}</>;
};

const AppRoutes = () => (
  <ChunkErrorBoundary>
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/data-deletion" element={<DataDeletion />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />
      <Route path="/p/:slug" element={<Poll />} />
      <Route path="/p/:slug/results" element={<PollResultsPage />} />
      <Route path="/verify-email" element={<RouteGuard requireAuth requireVerifiedEmail={false}><VerifyEmail /></RouteGuard>} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="/onboarding" element={<RouteGuard requireAuth requireOnboarding={false}><Onboarding /></RouteGuard>} />
      <Route path="/results" element={<RouteGuard requireAuth requireOnboarding><QuizResults /></RouteGuard>} />
      <Route path="/feed" element={<Navigate to="/profile" replace />} />
      <Route path="/candidates" element={<RouteGuard requireAuth={false} requireOnboarding={false}><Candidates /></RouteGuard>} />
      <Route path="/donors" element={<RouteGuard requireAuth={false} requireOnboarding={false}><Donors /></RouteGuard>} />
      <Route path="/committees" element={<RouteGuard requireAuth={false} requireOnboarding={false}><Committees /></RouteGuard>} />
      <Route path="/top-spenders" element={<RouteGuard requireAuth={false} requireOnboarding={false}><TopSpenders /></RouteGuard>} />
      <Route path="/committee/:id" element={<RouteGuard requireAuth requireOnboarding={false}><CommitteeProfile /></RouteGuard>} />
      <Route path="/parties" element={<RouteGuard requireAuth={false} requireOnboarding={false}><Parties /></RouteGuard>} />
      <Route path="/party/:id" element={<RouteGuard requireAuth={false} requireOnboarding={false}><PartyProfile /></RouteGuard>} />
      <Route path="/donor/:id" element={<RouteGuard requireAuth requireOnboarding={false}><DonorProfile /></RouteGuard>} />
      <Route path="/candidate/:id" element={<RouteGuard requireAuth={false} requireOnboarding={false}><CandidateProfile /></RouteGuard>} />
      {/* Headless render target for the automatic social-post screenshotter (public, no chrome). */}
      <Route path="/r/card/:candidateId" element={<StatCardRender />} />
      <Route path="/profile" element={<RouteGuard requireAuth requireOnboarding><UserProfile /></RouteGuard>} />
      <Route path="/quiz" element={<RouteGuard requireAuth requireOnboarding><Quiz /></RouteGuard>} />
      <Route path="/quiz-library" element={<RouteGuard requireAuth requireOnboarding><QuizLibrary /></RouteGuard>} />
      <Route path="/how-scoring-works" element={<RouteGuard requireAuth={false} requireOnboarding={false}><HowScoringWorks /></RouteGuard>} />
      <Route path="/admin" element={<RouteGuard requireAuth requireOnboarding><Admin /></RouteGuard>} />
      <Route path="/admin/users/:userId" element={<RouteGuard requireAuth requireOnboarding><AdminUserProfileView /></RouteGuard>} />
      <Route path="/admin/x-composer" element={<RouteGuard requireAuth requireOnboarding><XComposer /></RouteGuard>} />
      <Route path="/admin/social-composer" element={<RouteGuard requireAuth requireOnboarding><SocialComposer /></RouteGuard>} />
      <Route path="/admin/social-handles" element={<RouteGuard requireAuth requireOnboarding><SocialHandles /></RouteGuard>} />
      <Route path="/admin/social-posts" element={<RouteGuard requireAuth requireOnboarding><SocialPosts /></RouteGuard>} />
      <Route path="/admin/x-connect/callback" element={<RouteGuard requireAuth requireOnboarding><XConnectCallback /></RouteGuard>} />
      <Route path="/admin/tiktok-connect" element={<RouteGuard requireAuth requireOnboarding><TikTokConnect /></RouteGuard>} />
      <Route path="/admin/tiktok-connect/callback" element={<RouteGuard requireAuth requireOnboarding><TikTokConnectCallback /></RouteGuard>} />
      <Route path="/politician" element={<RouteGuard requireAuth requireOnboarding><PoliticianDashboard /></RouteGuard>} />
      <Route path="/blog" element={<RouteGuard requireAuth={false} requireOnboarding={false}><Blog /></RouteGuard>} />
      <Route path="/jobs" element={<RouteGuard requireAuth={false} requireOnboarding={false}><Jobs /></RouteGuard>} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </ChunkErrorBoundary>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <UserProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <BadgeAwardToast />
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </UserProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
