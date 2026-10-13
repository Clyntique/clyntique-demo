import { LogOutIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

// A plain form POST to /auth/logout (not a server action), so signing out
// loads the sign-in page as a new document and clears the browser's cache of
// this account's pages. See src/app/auth/logout/route.ts.
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form method="post" action="/auth/logout">
      <button
        type="submit"
        title="Sign out"
        className={cn(
          "inline-flex items-center gap-2 rounded-md text-small font-medium text-muted transition-colors hover:bg-subtle hover:text-ink",
          compact ? "size-8 justify-center" : "h-8 w-full px-2",
        )}
      >
        <LogOutIcon className="size-4" />
        <span className={compact ? "sr-only" : undefined}>Sign out</span>
      </button>
    </form>
  );
}
