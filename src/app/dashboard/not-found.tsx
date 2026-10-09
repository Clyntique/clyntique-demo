import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function ClientNotFound() {
  return (
    <EmptyState
      title="This page doesn't exist, or you don't have access to it."
      action={
        <Link href="/dashboard/projects" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Back to projects
        </Link>
      }
    />
  );
}
