import type { NextRequest } from "next/server";
import { getCurrentUser, homePathFor } from "@/lib/auth/dal";
import { freshDocumentRedirect } from "../fresh-document";

/*
 * After a successful sign-in the form loads this URL as a new document. It
 * sends the user to their own home (or back to sign-in without a session),
 * clearing the browser's cache of the previous account's pages on the way.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  return freshDocumentRedirect(request, user ? homePathFor(user.role) : "/auth/login");
}
