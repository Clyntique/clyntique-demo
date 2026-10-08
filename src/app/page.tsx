import { redirect } from "next/navigation";

// The proxy sends signed-in users from /auth/login to their own home.
export default function Home() {
  redirect("/auth/login");
}
