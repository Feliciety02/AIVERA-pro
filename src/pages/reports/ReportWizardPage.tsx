import { useNavigate, useSearchParams } from "react-router";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { ReportWizard } from "@/components/forms/ReportWizard";
import { Callout } from "@/components/shared/display";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { can, deniedReason } from "@/lib/permissions";

export default function ReportWizardPage() {
  useDocumentTitle("Create report");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useCurrentUser();
  return (
    <ContentContainer className="max-w-6xl">
      <PageHeader title="Create security report" description="Seven steps from project selection to a downloadable, watermarked demonstration report." />
      {!user || !can(user.role, "generate_reports") ? (
        <Callout tone="warning" title="Not permitted for this demo role">{deniedReason(user?.role)}</Callout>
      ) : (
        <ReportWizard userId={user.id} initialProjectId={params.get("project") ?? undefined} initialTemplate={params.get("template") ?? undefined} onCancel={() => navigate("/reports")} />
      )}
    </ContentContainer>
  );
}
