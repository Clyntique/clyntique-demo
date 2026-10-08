"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

// Error boundary UI for workspace pages (used by each area's error.tsx).
export function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      description="We couldn't load this page."
      action={
        <Button variant="secondary" size="sm" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
