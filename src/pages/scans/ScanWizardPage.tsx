import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { ScanWizard } from "@/components/forms/ScanWizard";
import { Callout } from "@/components/shared/display";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { can, deniedReason } from "@/lib/permissions";
import { scanService } from "@/services";

export default function ScanWizardPage() {
  useDocumentTitle("New scan");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useCurrentUser();
  const { projects, targets, defaults } = useDataStore(useShallow((s) => ({ projects: s.projects, targets: s.targets, defaults: s.settings.assessmentDefaults })));
  const initialTarget = params.get("target") ?? undefined;
  const initialProject = params.get("project") ?? (initialTarget ? targets.find((t) => t.id === initialTarget)?.projectId : undefined);

  return (
    <ContentContainer className="max-w-6xl">
      <PageHeader title="New security assessment" description="Six guided steps: project, authorized target, scope confirmation, tools, configuration and review." />
      {!can(user?.role, "run_demo_scans") ? (
        <Callout tone="warning" title="Not permitted for this demo role">
          {deniedReason(user?.role)}
        </Callout>
      ) : (
        <ScanWizard
          projects={projects}
          targets={targets}
          defaults={defaults}
          initialProjectId={initialProject}
          initialTargetId={initialTarget}
          onCancel={() => navigate("/scans")}
          onSimulate={async (r) => {
            const scan = await scanService.runDemoSimulation(r, (count) => {
              toast.success(`Simulation ${scan.code} finished`, { description: `${count} SIMULATED finding(s) await human verification.`, action: { label: "View findings", onClick: () => navigate(`/findings?scan=${scan.id}`) } });
            });
            toast.info(`Demo simulation ${scan.code} started`, { description: "Runs in your browser only. No requests are sent to the target." });
            navigate(`/scans/${scan.id}`);
          }}
        />
      )}
    </ContentContainer>
  );
}
