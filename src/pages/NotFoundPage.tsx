import { Link } from "react-router";
import { Compass } from "lucide-react";
import { ContentContainer } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks";

export default function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <ContentContainer>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This route does not exist in AEGIS AI. Use the navigation or global search (Ctrl K) to find what you need."
        action={
          <Button asChild size="sm">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    </ContentContainer>
  );
}
