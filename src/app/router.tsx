import * as React from "react";
import { createBrowserRouter } from "react-router";
import { AppShell, ContentContainer } from "@/components/layout/AppShell";
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
const Recon = React.lazy(() => import("@/pages/reconnaissance/ReconPage"));
const Scans = React.lazy(() => import("@/pages/scans/ScansPage"));
const ScanNew = React.lazy(() => import("@/pages/scans/ScanWizardPage"));
const ScanDetail = React.lazy(() => import("@/pages/scans/ScanDetailPage"));
const Assessments = React.lazy(() => import("@/pages/assessments/AssessmentsPage"));
const AssessmentDetail = React.lazy(() => import("@/pages/assessments/AssessmentDetailPage"));
const AIAnalyst = React.lazy(() => import("@/pages/ai/AIAnalystPage"));
const Findings = React.lazy(() => import("@/pages/findings/FindingsPage"));
const FindingDetail = React.lazy(() => import("@/pages/findings/FindingDetailPage"));
const Risks = React.lazy(() => import("@/pages/risks/RisksPage"));
const Remediation = React.lazy(() => import("@/pages/remediation/RemediationPage"));
const Reports = React.lazy(() => import("@/pages/reports/ReportsPage"));
const ReportNew = React.lazy(() => import("@/pages/reports/ReportWizardPage"));
const ReportDetail = React.lazy(() => import("@/pages/reports/ReportDetailPage"));
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


export const router = createBrowserRouter([
  { path: "/", element: s(<Landing />) },
  { path: "/login", element: s(<Login />) },
  { path: "/signup", element: s(<Signup />) },
  {
    element: <AppShell />,
    children: [
      { path: "/dashboard", element: s(<Dashboard />) },
      { path: "/analytics", element: s(<Analytics />) },
      { path: "/projects", element: s(<Projects />) },
      { path: "/projects/new", element: s(<ProjectNew />) },
      { path: "/projects/:projectId", element: s(<ProjectDetail />) },
      { path: "/projects/:projectId/edit", element: s(<ProjectNew />) },
      { path: "/targets", element: s(<Targets />) },
      { path: "/targets/new", element: s(<TargetForm />) },
      { path: "/targets/:targetId", element: s(<TargetDetail />) },
      { path: "/targets/:targetId/edit", element: s(<TargetForm />) },
      { path: "/reconnaissance", element: s(<Recon />) },
      { path: "/scans", element: s(<Scans />) },
      { path: "/scans/new", element: s(<ScanNew />) },
      { path: "/scans/:scanId", element: s(<ScanDetail />) },
      { path: "/assessments", element: s(<Assessments />) },
      { path: "/assessments/:categoryId", element: s(<AssessmentDetail />) },
      { path: "/ai-analyst", element: s(<AIAnalyst />) },
      { path: "/findings", element: s(<Findings />) },
      { path: "/findings/:findingId", element: s(<FindingDetail />) },
      { path: "/risks", element: s(<Risks />) },
      { path: "/remediation", element: s(<Remediation />) },
      { path: "/reports", element: s(<Reports />) },
      { path: "/reports/new", element: s(<ReportNew />) },
      { path: "/reports/:reportId", element: s(<ReportDetail />) },
      { path: "/activity", element: s(<Activity />) },
      { path: "/users", element: s(<Users />) },
      { path: "/integrations", element: s(<Integrations />) },
      { path: "/settings", element: s(<Settings />) },
      { path: "*", element: s(<NotFound />) },
    ],
  },
]);
