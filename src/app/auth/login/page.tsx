import type { Metadata } from "next";
import { Brand } from "@/components/layout/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Clyntique" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <Brand className="mb-8" />
        <div className="rounded-lg border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-page-title text-[20px]">Sign in</h1>
          <p className="text-body mt-1 mb-6 text-muted">
            Submit advertising creatives for compliance review, and track findings and decisions in one place.
          </p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
