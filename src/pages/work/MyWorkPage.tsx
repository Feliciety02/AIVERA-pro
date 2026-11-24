import { Inbox } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { MyWorkList } from "@/components/dashboard/MyWorkList";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { useMyWork } from "@/features/myWork";
import { ROLE_META } from "@/lib/constants";

/** The full "waiting on you" list. Home shows the first few of each group. */
export default function MyWorkPage() {
  useDocumentTitle("My work");
  const user = useCurrentUser();
  const w = useMyWork();

  return (
    <ContentContainer>
      <PageHeader
        title="My work"
        description={user ? `Everything waiting on you as ${ROLE_META[user.role].label}. New findings go to the assessor with the fewest open reviews, fixes go to the project's developer, and approvals go to the project's lead.` : undefined}
      />
      {w.total === 0 ? (
        <EmptyState icon={Inbox} title="Nothing waiting on you" description="New assignments show up here and in your notifications." />
      ) : (
        <SectionCard title={`${w.total} item${w.total === 1 ? "" : "s"} waiting on you`} icon={Inbox}>
          <MyWorkList work={w} />
        </SectionCard>
      )}
    </ContentContainer>
  );
}
