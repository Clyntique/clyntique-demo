import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function TeamNotFound() {
  return (
    <EmptyState
      title="This page doesn't exist, or you don't have access to it."
      action={
        <Link href="/admin/projects" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Back to projects
        </Link>
      }
    />
  );
}
