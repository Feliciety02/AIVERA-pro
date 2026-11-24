import * as React from "react";
import { createBrowserRouter, Navigate, useSearchParams } from "react-router";

/** Old links to the report wizard now open the create dialog on the Reports page. */
function ReportNewRedirect() {
  const [params] = useSearchParams();
  const project = params.get("project");
  return <Navigate to={`/reports?new=1${project ? `&project=${encodeURIComponent(project)}` : ""}`} replace />;
}
import { AppShell, ContentContainer } from "@/components/layout/AppShell";
import { useCurrentUser } from "@/hooks";
import { ADMIN, TEAM } from "@/components/layout/nav";
import type { UserRole } from "@/types";

/** Pages a role doesn't use send it home, so every role sees only the screens for its job. */
function Only({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const user = useCurrentUser();
  if (user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
import { CardsSkeleton, TableSkeleton } from "@/components/shared/states";

/* Route-level code splitting keeps the initial bundle small. */
const Signup = React.lazy(() => import("@/pages/auth/SignupPage"));
const Landing = React.lazy(() => import("@/pages/LandingPage"));
const Login = React.lazy(() => import("@/pages/auth/LoginPage"));
const Dashboard = React.lazy(() => import("@/pages/dashboard/DashboardPage"));
const Analytics = React.lazy(() => import("@/pages/analytics/AnalyticsPage"));
const Projects = React.lazy(() => import("@/pages/projects/ProjectsPage"));
const ProjectNew = React.lazy(() => import("@/pages/projects/ProjectFormPage"));
const ProjectDetail = React.lazy(() => import("@/pages/projects/ProjectDetailPage"));
const Targets = React.lazy(() => import("@/pages/targets/TargetsPage"));
const TargetForm = React.lazy(() => import("@/pages/targets/TargetFormPage"));
const TargetDetail = React.lazy(() => import("@/pages/targets/TargetDetailPage"));
const Scans = React.lazy(() => import("@/pages/scans/ScansPage"));
const ScanNew = React.lazy(() => import("@/pages/scans/ScanWizardPage"));
const ScanDetail = React.lazy(() => import("@/pages/scans/ScanDetailPage"));
const Assessments = React.lazy(() => import("@/pages/assessments/AssessmentsPage"));
const AssessmentDetail = React.lazy(() => import("@/pages/assessments/AssessmentDetailPage"));
const AIAnalyst = React.lazy(() => import("@/pages/ai/AIAnalystPage"));
const Findings = React.lazy(() => import("@/pages/findings/FindingsPage"));
const FindingDetail = React.lazy(() => import("@/pages/findings/FindingDetailPage"));
const Remediation = React.lazy(() => import("@/pages/remediation/RemediationPage"));
const Reports = React.lazy(() => import("@/pages/reports/ReportsPage"));
const ReportDetail = React.lazy(() => import("@/pages/reports/ReportDetailPage"));
const MyWork = React.lazy(() => import("@/pages/work/MyWorkPage"));
const Activity = React.lazy(() => import("@/pages/activity/ActivityPage"));
const Users = React.lazy(() => import("@/pages/users/UsersPage"));
const Integrations = React.lazy(() => import("@/pages/integrations/IntegrationsPage"));
const Settings = React.lazy(() => import("@/pages/settings/SettingsPage"));
const NotFound = React.lazy(() => import("@/pages/NotFoundPage"));

function PageFallback() {
  return (
    <ContentContainer>
      <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
      <CardsSkeleton />
      <TableSkeleton />
    </ContentContainer>
  );
}

const s = (el: React.ReactNode) => <React.Suspense fallback={<PageFallback />}>{el}</React.Suspense>;
const team = (el: React.ReactNode) => <Only roles={TEAM}>{s(el)}</Only>;
const admin = (el: React.ReactNode) => <Only roles={ADMIN}>{s(el)}</Only>;


export const router = createBrowserRouter([
  { path: "/", element: s(<Landing />) },
  { path: "/login", element: s(<Login />) },
  { path: "/signup", element: s(<Signup />) },
  {
    element: <AppShell />,
    children: [
      { path: "/dashboard", element: s(<Dashboard />) },
      { path: "/my-work", element: s(<MyWork />) },
      { path: "/analytics", element: team(<Analytics />) },
      { path: "/projects", element: team(<Projects />) },
      { path: "/projects/new", element: team(<ProjectNew />) },
      { path: "/projects/:projectId", element: team(<ProjectDetail />) },
      { path: "/projects/:projectId/edit", element: team(<ProjectNew />) },
      { path: "/targets", element: s(<Targets />) },
      { path: "/targets/new", element: team(<TargetForm />) },
      { path: "/targets/:targetId", element: s(<TargetDetail />) },
      { path: "/targets/:targetId/edit", element: team(<TargetForm />) },
      // Merged pages: old links land on the view that replaced them.
      { path: "/reconnaissance", element: <Navigate to="/targets?view=discovery" replace /> },
      { path: "/scans", element: team(<Scans />) },
      { path: "/scans/new", element: team(<ScanNew />) },
      { path: "/scans/:scanId", element: team(<ScanDetail />) },
      { path: "/assessments", element: team(<Assessments />) },
      { path: "/assessments/:categoryId", element: team(<AssessmentDetail />) },
      { path: "/ai-analyst", element: team(<AIAnalyst />) },
      { path: "/findings", element: team(<Findings />) },
      { path: "/findings/:findingId", element: s(<FindingDetail />) },
      { path: "/risks", element: <Navigate to="/findings?view=risks" replace /> },
      { path: "/remediation", element: s(<Remediation />) },
      { path: "/reports", element: s(<Reports />) },
      { path: "/reports/new", element: <ReportNewRedirect /> },
      { path: "/reports/:reportId", element: s(<ReportDetail />) },
      { path: "/activity", element: admin(<Activity />) },
      { path: "/users", element: admin(<Users />) },
      { path: "/integrations", element: admin(<Integrations />) },
      { path: "/settings", element: s(<Settings />) },
      { path: "*", element: s(<NotFound />) },
    ],
  },
]);
