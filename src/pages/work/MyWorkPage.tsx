import { Inbox } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { MyWorkList } from "@/components/dashboard/MyWorkList";
import { useDocumentTitle } from "@/hooks";
import { useMyWork } from "@/features/myWork";

/** The full "waiting on you" list. Home shows the first few of each group. */
export default function MyWorkPage() {
  useDocumentTitle("My work");
  const w = useMyWork();

  return (
    <ContentContainer>
      <PageHeader
        title="My work"
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
