import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { UserProvider } from "./context/UserContext";
import { Auth } from "./pages/Auth";
import { Candidates } from "./pages/Candidates";
import { Donors } from "./pages/Donors";
import { CandidateProfile } from "./pages/CandidateProfile";
import { UserProfile } from "./pages/UserProfile";
import { Quiz } from "./pages/Quiz";
import { QuizResults } from "./pages/QuizResults";
import Parties from "./pages/Parties";
import PartyProfile from "./pages/PartyProfile";
import DonorProfile from "./pages/DonorProfile";
import { QuizLibrary } from "./pages/QuizLibrary";
import { HowScoringWorks } from "./pages/HowScoringWorks";
import Admin from "./pages/Admin";
import AdminUserProfileView from "./pages/AdminUserProfileView";
import PoliticianDashboard from "./pages/PoliticianDashboard";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import DataDeletion from "./pages/DataDeletion";
import VerifyEmail from "./pages/VerifyEmail";
import { useHasCompletedOnboarding } from "./hooks/useProfile";
import { LoadingScreen } from "./components/LoadingScreen";
import { Committees } from "./pages/Committees";
import { CommitteeProfile } from "./pages/CommitteeProfile";
import Blog from "./pages/Blog";
import Unsubscribe from "./pages/Unsubscribe";
import Poll from "./pages/Poll";
import PollResultsPage from "./pages/PollResultsPage";
import TopSpenders from "./pages/TopSpenders";
import XComposer from "./pages/admin/XComposer";
import XConnectCallback from "./pages/admin/XConnectCallback";
import SocialComposer from "./pages/admin/SocialComposer";
import SocialHandles from "./pages/admin/SocialHandles";

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

// Consolidated route guard with configurable auth and onboarding requirements
interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireOnboarding?: boolean;
  requireVerifiedEmail?: boolean;
}

const RouteGuard = ({ 
  children, 
  requireAuth = true, 
  requireOnboarding = false,
  requireVerifiedEmail = true,
}: RouteGuardProps) => {
  const { user, loading: authLoading } = useAuth();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();
  
  // Only check onboarding if required
  const isLoading = authLoading || (requireOnboarding && onboardingLoading);
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (requireAuth && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Block access until email is verified
  if (requireAuth && requireVerifiedEmail && user && !user.email_confirmed_at) {
    return <Navigate to="/verify-email" replace />;
  }
  
  if (requireOnboarding && !hasCompleted) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/data-deletion" element={<DataDeletion />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />
      <Route path="/p/:slug" element={<Poll />} />
      <Route path="/p/:slug/results" element={<PollResultsPage />} />
      <Route path="/verify-email" element={
        <RouteGuard requireAuth requireVerifiedEmail={false}>
          <VerifyEmail />
        </RouteGuard>
      } />
      <Route path="/" element={<Navigate to="/candidates" replace />} />
      <Route path="/results" element={
        <RouteGuard requireAuth requireOnboarding>
          <QuizResults />
        </RouteGuard>
      } />
      <Route path="/feed" element={<Navigate to="/profile" replace />} />
      <Route path="/candidates" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <Candidates />
        </RouteGuard>
      } />
      <Route path="/donors" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <Donors />
        </RouteGuard>
      } />
      <Route path="/committees" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <Committees />
        </RouteGuard>
      } />
      <Route path="/top-spenders" element={
        <RouteGuard requireAuth requireOnboarding={false}>
          <TopSpenders />
        </RouteGuard>
      } />
      <Route path="/committee/:id" element={
        <RouteGuard requireAuth requireOnboarding={false}>
          <CommitteeProfile />
        </RouteGuard>
      } />
      <Route path="/parties" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <Parties />
        </RouteGuard>
      } />
      <Route path="/party/:id" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <PartyProfile />
        </RouteGuard>
      } />
      <Route path="/donor/:id" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <DonorProfile />
        </RouteGuard>
      } />
      <Route path="/candidate/:id" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <CandidateProfile />
        </RouteGuard>
      } />
      <Route path="/profile" element={
        <RouteGuard requireAuth requireOnboarding>
          <UserProfile />
        </RouteGuard>
      } />
      <Route path="/quiz" element={
        <RouteGuard requireAuth requireOnboarding>
          <Quiz />
        </RouteGuard>
      } />
      <Route path="/quiz-library" element={
        <RouteGuard requireAuth requireOnboarding>
          <QuizLibrary />
        </RouteGuard>
      } />
      <Route path="/how-scoring-works" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <HowScoringWorks />
        </RouteGuard>
      } />
      <Route path="/admin" element={
        <RouteGuard requireAuth requireOnboarding>
          <Admin />
        </RouteGuard>
      } />
      <Route path="/admin/users/:userId" element={
        <RouteGuard requireAuth requireOnboarding>
          <AdminUserProfileView />
        </RouteGuard>
      } />
      <Route path="/admin/x-composer" element={
        <RouteGuard requireAuth requireOnboarding>
          <XComposer />
        </RouteGuard>
      } />
      <Route path="/admin/social-composer" element={
        <RouteGuard requireAuth requireOnboarding>
          <SocialComposer />
        </RouteGuard>
      } />
      <Route path="/admin/social-handles" element={
        <RouteGuard requireAuth requireOnboarding>
          <SocialHandles />
        </RouteGuard>
      } />
      <Route path="/admin/x-connect/callback" element={
        <RouteGuard requireAuth requireOnboarding>
          <XConnectCallback />
        </RouteGuard>
      } />
      <Route path="/politician" element={
        <RouteGuard requireAuth requireOnboarding>
          <PoliticianDashboard />
        </RouteGuard>
      } />
      <Route path="/blog" element={
        <RouteGuard requireAuth={false} requireOnboarding={false}>
          <Blog />
        </RouteGuard>
      } />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <UserProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </UserProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
