import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { ProjectForm, type ProjectFormValues } from "@/components/forms/ProjectForm";
import { NotFoundState } from "@/components/shared/states";
import { Callout } from "@/components/shared/display";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { can, deniedReason } from "@/lib/permissions";
import { projectService } from "@/services";

const toISO = (d: string) => new Date(`${d}T00:00:00Z`).toISOString();

export default function ProjectFormPage() {
  const { projectId } = useParams();
  const editing = !!projectId;
  useDocumentTitle(editing ? "Edit project" : "New project");
  const navigate = useNavigate();
  const users = useDataStore((s) => s.users);
  const project = useDataStore((s) => s.projects.find((p) => p.id === projectId));
  const user = useCurrentUser();

  if (editing && !project)
    return (
      <ContentContainer>
        <NotFoundState entity="Project" backTo="/projects" backLabel="Back to projects" />
      </ContentContainer>
    );

  const submit = async (v: ProjectFormValues) => {
    const payload = { ...v, notes: v.notes ?? "", startDate: toISO(v.startDate), dueDate: toISO(v.dueDate) };
    if (editing && project) {
      await projectService.update(project.id, payload);
      toast.success("Project updated");
      navigate(`/projects/${project.id}`);
    } else {
      const created = await projectService.create(payload);
      toast.success(`Created ${created.code}`, { description: "Next: register an authorized target for this project." });
      navigate(`/projects/${created.id}`);
    }
  };

  return (
    <ContentContainer className="max-w-5xl">
      <PageHeader
        title={editing ? `Edit ${project?.code}` : "Create assessment project"}
        description={editing ? project?.name : "Define the engagement before registering targets. Projects are planning records — creating one does not start any testing."}
      />
      {!can(user?.role, "manage_projects") ? (
        <Callout tone="warning" title="Not permitted for this demo role">
          {deniedReason(user?.role)}
        </Callout>
      ) : (
        <ProjectForm initial={project} users={users} onSubmit={submit} onCancel={() => navigate(-1)} submitLabel={editing ? "Save changes" : "Create project"} />
      )}
    </ContentContainer>
  );
}
