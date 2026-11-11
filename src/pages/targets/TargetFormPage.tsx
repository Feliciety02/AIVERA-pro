import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { NO_PROJECT_VALUE, TargetForm, type TargetFormValues } from "@/components/forms/TargetForm";
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
  const targets = useDataStore((s) => s.targets);
  const references = React.useMemo(() => targets.map((t) => t.authorizationReference), [targets]);

  if (editing && !target)
    return (
      <ContentContainer>
        <NotFoundState entity="Target" backTo="/targets" backLabel="Back to targets" />
      </ContentContainer>
    );

  const submit = async (v: TargetFormValues) => {
    const payload = { ...v, url: v.url.trim(), projectId: v.projectId === NO_PROJECT_VALUE ? undefined : v.projectId };
    if (editing && target) {
      await targetService.update(target.id, payload);
      toast.success("Target updated");
      navigate(`/targets/${target.id}`);
    } else {
      const created = await targetService.register(payload);
      toast.success("Target registered", { description: "Testing can start once it is in a project." });
      navigate(`/targets/${created.id}`);
    }
  };

  return (
    <ContentContainer className="max-w-5xl">
      <PageHeader
        title={editing ? `Edit ${target?.name}` : "Register a website to test"}
        description="Four quick steps: the address, your permission, what may be tested, and who owns it."
      />
      {!can(user?.role, "manage_targets") ? (
        <Callout tone="warning" title="Not permitted for this demo role">
          {deniedReason(user?.role)}
        </Callout>
      ) : (
        <TargetForm initial={target} projects={projects} existingReferences={references} defaultProjectId={params.get("project") ?? undefined} onSubmit={submit} onCancel={() => navigate(-1)} submitLabel={editing ? "Save target" : "Register target"} />
      )}
    </ContentContainer>
  );
}
