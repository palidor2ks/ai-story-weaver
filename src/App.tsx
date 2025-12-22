import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { UserProvider } from "./context/UserContext";
import Index from "./pages/Index";
import { Auth } from "./pages/Auth";
import { Feed } from "./pages/Feed";
import { Candidates } from "./pages/Candidates";
import { Donors } from "./pages/Donors";
import { CandidateProfile } from "./pages/CandidateProfile";
import { UserProfile } from "./pages/UserProfile";
import { Quiz } from "./pages/Quiz";
import { QuizResults } from "./pages/QuizResults";
import Parties from "./pages/Parties";
import PartyProfile from "./pages/PartyProfile";
import { QuizLibrary } from "./pages/QuizLibrary";
import { HowScoringWorks } from "./pages/HowScoringWorks";
import Admin from "./pages/Admin";
import PoliticianDashboard from "./pages/PoliticianDashboard";
import NotFound from "./pages/NotFound";
import { useHasCompletedOnboarding } from "./hooks/useProfile";

const queryClient = new QueryClient();

// Loading component
const LoadingScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

// Consolidated route guard with configurable auth and onboarding requirements
interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireOnboarding?: boolean;
}

const RouteGuard = ({ 
  children, 
  requireAuth = true, 
  requireOnboarding = false 
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
  
  if (requireOnboarding && !hasCompleted) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={
        <RouteGuard requireAuth requireOnboarding={false}>
          <Index />
        </RouteGuard>
      } />
      <Route path="/results" element={
        <RouteGuard requireAuth requireOnboarding>
          <QuizResults />
        </RouteGuard>
      } />
      <Route path="/feed" element={
        <RouteGuard requireAuth requireOnboarding>
          <Feed />
        </RouteGuard>
      } />
      <Route path="/candidates" element={
        <RouteGuard requireAuth requireOnboarding>
          <Candidates />
        </RouteGuard>
      } />
      <Route path="/donors" element={
        <RouteGuard requireAuth requireOnboarding>
          <Donors />
        </RouteGuard>
      } />
      <Route path="/parties" element={
        <RouteGuard requireAuth requireOnboarding>
          <Parties />
        </RouteGuard>
      } />
      <Route path="/party/:id" element={
        <RouteGuard requireAuth requireOnboarding>
          <PartyProfile />
        </RouteGuard>
      } />
      <Route path="/candidate/:id" element={
        <RouteGuard requireAuth requireOnboarding>
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
        <RouteGuard requireAuth requireOnboarding>
          <HowScoringWorks />
        </RouteGuard>
      } />
      <Route path="/admin" element={
        <RouteGuard requireAuth requireOnboarding>
          <Admin />
        </RouteGuard>
      } />
      <Route path="/politician" element={
        <RouteGuard requireAuth requireOnboarding>
          <PoliticianDashboard />
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
