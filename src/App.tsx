import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { UserProvider, useUser } from "./context/UserContext";
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

// Auth protected route wrapper
const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
};

// Onboarding protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();
  
  if (authLoading || onboardingLoading) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  if (!hasCompleted) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={
        <AuthRoute>
          <Index />
        </AuthRoute>
      } />
      <Route path="/results" element={
        <ProtectedRoute>
          <QuizResults />
        </ProtectedRoute>
      } />
      <Route path="/feed" element={
        <ProtectedRoute>
          <Feed />
        </ProtectedRoute>
      } />
      <Route path="/candidates" element={
        <ProtectedRoute>
          <Candidates />
        </ProtectedRoute>
      } />
      <Route path="/donors" element={
        <ProtectedRoute>
          <Donors />
        </ProtectedRoute>
      } />
      <Route path="/parties" element={
        <ProtectedRoute>
          <Parties />
        </ProtectedRoute>
      } />
      <Route path="/party/:id" element={
        <ProtectedRoute>
          <PartyProfile />
        </ProtectedRoute>
      } />
      <Route path="/candidate/:id" element={
        <ProtectedRoute>
          <CandidateProfile />
        </ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute>
          <UserProfile />
        </ProtectedRoute>
      } />
      <Route path="/quiz" element={
        <ProtectedRoute>
          <Quiz />
        </ProtectedRoute>
      } />
      <Route path="/quiz-library" element={
        <ProtectedRoute>
          <QuizLibrary />
        </ProtectedRoute>
      } />
      <Route path="/how-scoring-works" element={
        <ProtectedRoute>
          <HowScoringWorks />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      } />
      <Route path="/politician" element={
        <ProtectedRoute>
          <PoliticianDashboard />
        </ProtectedRoute>
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
