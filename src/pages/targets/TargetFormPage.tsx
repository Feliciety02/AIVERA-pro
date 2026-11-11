import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { TargetForm, type TargetFormValues } from "@/components/forms/TargetForm";
import { NotFoundState } from "@/components/shared/states";
import { Callout } from "@/components/shared/display";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { can, deniedReason } from "@/lib/permissions";
import { targetService } from "@/services";

export default function TargetFormPage() {
  const { targetId } = useParams();
  const [params] = useSearchParams();
  const editing = !!targetId;
  useDocumentTitle(editing ? "Edit target" : "Register target");
  const navigate = useNavigate();
  const user = useCurrentUser();
  const projects = useDataStore((s) => s.projects);
  const target = useDataStore((s) => s.targets.find((t) => t.id === targetId));

  if (editing && !target)
    return (
      <ContentContainer>
        <NotFoundState entity="Target" backTo="/targets" backLabel="Back to targets" />
      </ContentContainer>
    );

  const submit = async (v: TargetFormValues) => {
    const payload = { ...v, url: v.url.trim() };
    if (editing && target) {
      await targetService.update(target.id, payload);
      toast.success("Target updated", { description: "Metadata saved. No connection was made to the target." });
      navigate(`/targets/${target.id}`);
    } else {
      const created = await targetService.register(payload);
      toast.success("Target registered", { description: "Saved as metadata only — the URL was not contacted." });
      navigate(`/targets/${created.id}`);
    }
  };

  return (
    <ContentContainer className="max-w-5xl">
      <PageHeader
        title={editing ? `Edit ${target?.name}` : "Register authorized target"}
        description="Define the application, its authorization, and exactly what may be tested. This form performs URL syntax validation only."
      />
      {!can(user?.role, "manage_targets") ? (
        <Callout tone="warning" title="Not permitted for this demo role">
          {deniedReason(user?.role)}
        </Callout>
      ) : (
        <TargetForm initial={target} projects={projects} defaultProjectId={params.get("project") ?? undefined} onSubmit={submit} onCancel={() => navigate(-1)} submitLabel={editing ? "Save target" : "Register target"} />
      )}
    </ContentContainer>
  );
}
