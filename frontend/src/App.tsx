import { Component, useEffect, type ReactNode, type ErrorInfo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", e, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", color: "red" }}>
          <h2>Ошибка рендера</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {(this.state.error as Error).message}
            {"\n\n"}
            {(this.state.error as Error).stack}
          </pre>
          <button onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/hooks/use-language";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import type { UserRole } from "@/types/auth";
import GroupsPage from "./pages/GroupsPage.tsx";
import CoursesPage from "./pages/CoursesPage.tsx";
import CourseProfile from "./pages/CourseProfile.tsx";
import GroupProfile from "./pages/GroupProfile.tsx";
import AnalyticsPage from "./pages/AnalyticsPage.tsx";
import Index from "./pages/Index.tsx";
import StudentsPage from "./pages/StudentsPage.tsx";
import TeachersPage from "./pages/TeachersPage.tsx";
import StudentProfile from "./pages/StudentProfile.tsx";
import TeacherProfile from "./pages/TeacherProfile.tsx";
import TeacherDashboard from "./pages/TeacherDashboard.tsx";
import TeacherSettingsPage from "./pages/TeacherSettingsPage.tsx";
import StudentDashboard from "./pages/StudentDashboard.tsx";
import StudentMyAttendance from "./pages/StudentMyAttendance.tsx";
import StudentMyPayments from "./pages/StudentMyPayments.tsx";
import StudentMySchedule from "./pages/StudentMySchedule.tsx";
import StudentSettingsPage from "./pages/StudentSettingsPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import NotificationsPage from "./pages/NotificationsPage.tsx";
import RoomsPage from "./pages/RoomsPage.tsx";
import PaymentsPage from "./pages/PaymentsPage.tsx";
import DebtorsPage from "./pages/DebtorsPage.tsx";
import SalaryPage from "./pages/SalaryPage.tsx";
import PayrollPage from "./pages/PayrollPage.tsx";
import SchedulePage from "./pages/SchedulePage.tsx";
import JournalPage from "./pages/JournalPage.tsx";
import WhiteboardPage from "./pages/WhiteboardPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import ManagerDashboard from "./pages/ManagerDashboard.tsx";
import ManagerAnalytics from "./pages/ManagerAnalytics.tsx";
import ManagersPage from "./pages/ManagersPage.tsx";
import ManagerSettingsPage from "./pages/ManagerSettingsPage.tsx";
import { useBranding } from "@/hooks/use-branding";

const DEFAULT_FAVICON = "/favicon-default.svg";

function setFavicon(href: string) {
  // Remove all existing icon links to force Chrome to release its favicon cache
  document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='apple-touch-icon']").forEach(el => el.remove());
  const link = document.createElement("link");
  link.id = "app-favicon";
  link.rel = "icon";
  link.type = "image/png";
  link.href = href;
  document.head.appendChild(link);
}

function BrandingEffects() {
  const { brandName, brandLogo } = useBranding();
  useEffect(() => {
    document.title = brandName;
    setFavicon(brandLogo ?? DEFAULT_FAVICON);
  }, [brandName, brandLogo]);
  return null;
}

// Sane defaults: caches are fresh for 30s and we don't refetch the world on
// every focus event. Individual queries can opt-in to tighter staleness.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function DashboardSwitch() {
  const { user } = useAuth();
  if (user?.role === "teacher") return <TeacherDashboard />;
  if (user?.role === "student") return <StudentDashboard />;
  if (user?.role === "manager") return <ManagerDashboard />;
  return <Index />;
}

function AnalyticsSwitch() {
  const { user } = useAuth();
  if (user?.role === "manager") return <ManagerAnalytics />;
  return <AnalyticsPage />;
}

function SettingsSwitch() {
  const { user } = useAuth();
  if (user?.role === "teacher") return <TeacherSettingsPage />;
  if (user?.role === "student") return <StudentSettingsPage />;
  if (user?.role === "manager") return <ManagerSettingsPage />;
  return <SettingsPage />;
}

function MyProfile() {
  const { user } = useAuth();
  if (user?.role === "teacher" && user.teacherId) {
    return <Navigate to={`/teachers/${user.teacherId}`} replace />;
  }
  if (user?.role === "student") return <Navigate to="/" replace />;
  return <Navigate to="/settings" replace />;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/" element={<ProtectedRoute><DashboardSwitch /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />

    {/* Shared (admin + teacher + manager with backend-side scoping) */}
    <Route path="/students" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><StudentsPage /></ProtectedRoute>} />
    <Route path="/students/:id" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><StudentProfile /></ProtectedRoute>} />
    <Route path="/groups" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><GroupsPage /></ProtectedRoute>} />
    <Route path="/groups/:id" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><GroupProfile /></ProtectedRoute>} />
    <Route path="/schedule" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><SchedulePage /></ProtectedRoute>} />
    <Route path="/journal" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><JournalPage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><NotificationsPage /></ProtectedRoute>} />
    <Route path="/whiteboard" element={<ProtectedRoute allowedRoles={["admin", "teacher"]}><WhiteboardPage /></ProtectedRoute>} />
    {/* Teacher/manager can view teacher profiles */}
    <Route path="/teachers/:id" element={<ProtectedRoute allowedRoles={["admin", "teacher", "manager"]}><TeacherProfile /></ProtectedRoute>} />

    {/* Student cabinet (self) */}
    <Route path="/me/attendance" element={<ProtectedRoute allowedRoles={["student"]}><StudentMyAttendance /></ProtectedRoute>} />
    <Route path="/me/payments" element={<ProtectedRoute allowedRoles={["student"]}><StudentMyPayments /></ProtectedRoute>} />
    <Route path="/me/schedule" element={<ProtectedRoute allowedRoles={["student"]}><StudentMySchedule /></ProtectedRoute>} />

    {/* Admin-only */}
    <Route path="/payments" element={<ProtectedRoute allowedRoles={["admin"]}><PaymentsPage /></ProtectedRoute>} />
    <Route path="/salary" element={<ProtectedRoute allowedRoles={["admin"]}><SalaryPage /></ProtectedRoute>} />
    <Route path="/finance/payroll" element={<ProtectedRoute allowedRoles={["admin"]}><PayrollPage /></ProtectedRoute>} />
    <Route path="/managers" element={<ProtectedRoute allowedRoles={["admin"]}><ManagersPage /></ProtectedRoute>} />

    {/* Admin + Manager */}
    <Route path="/teachers" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><TeachersPage /></ProtectedRoute>} />
    <Route path="/courses" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><CoursesPage /></ProtectedRoute>} />
    <Route path="/courses/:id" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><CourseProfile /></ProtectedRoute>} />
    <Route path="/analytics" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><AnalyticsSwitch /></ProtectedRoute>} />
    <Route path="/rooms" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><RoomsPage /></ProtectedRoute>} />
    <Route path="/debtors" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><DebtorsPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsSwitch /></ProtectedRoute>} />

    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrandingEffects />
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          {/* Single toast surface — sonner. Removed legacy shadcn Toaster to
              avoid duplicate prompts and inconsistent UX. */}
          <Sonner />
          <BrowserRouter>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
