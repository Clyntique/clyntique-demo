import { logout } from "@/app/auth/actions";
import { LogOutIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

// Uses the Phase 1B logout server action.
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logout}>
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
