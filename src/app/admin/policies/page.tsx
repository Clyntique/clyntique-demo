import { redirect } from "next/navigation";

// Older links (dashboard card, AI panel) point here; the library lives at
// /admin/policy-library. /admin is TEAM-only (proxy + the page's own check).
export default function PoliciesRedirect() {
  redirect("/admin/policy-library");
}
