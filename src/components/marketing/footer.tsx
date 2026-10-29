import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { REVIEW_DISCLAIMER } from "@/lib/workflow/labels";

export function MarketingFooter() {
  return (
    <footer className="w-full border-t border-line bg-surface py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 lg:gap-12">
          {/* Brand Info */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <Brand size="md" className="select-none" />
            <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted">
              Premium Business Infrastructure · Operations · Concierge
            </div>
            <p className="text-small text-muted mt-2 max-w-sm leading-relaxed">
              The authoritative enterprise workspace uniting creative submissions, evidence substantiation, and policy-grounded review workflows.
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-col gap-3">
            <h4 className="text-small font-semibold text-ink uppercase tracking-wider text-[11px]">
              Platform
            </h4>
            <ul className="flex flex-col gap-2.5 text-small text-muted">
              <li>
                <a href="#how-it-works" className="hover:text-brand-600 transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#workflow" className="hover:text-brand-600 transition-colors">
                  Product Workflow
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-brand-600 transition-colors">
                  Enterprise Features
                </a>
              </li>
              <li>
                <a href="#policy-ai" className="hover:text-brand-600 transition-colors">
                  AI Policy Library
                </a>
              </li>
            </ul>
          </div>

          {/* Workspace Access */}
          <div className="flex flex-col gap-3">
            <h4 className="text-small font-semibold text-ink uppercase tracking-wider text-[11px]">
              Workspace
            </h4>
            <ul className="flex flex-col gap-2.5 text-small text-muted">
              <li>
                <Link href="/auth/login" className="hover:text-brand-600 transition-colors">
                  Sign In
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/login?mode=signup"
                  className="hover:text-brand-600 transition-colors"
                >
                  Create Client Account
                </Link>
              </li>
              <li>
                <Link href="/demo" className="hover:text-brand-600 transition-colors">
                  Evaluator Demo Access
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Disclaimer & Bottom Bar */}
        <div className="mt-12 border-t border-line/70 pt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-caption text-muted">
          <p className="max-w-2xl text-[11px] leading-relaxed">
            {REVIEW_DISCLAIMER}
          </p>
          <p className="shrink-0 text-[11px]">
            &copy; 2026 Clyntique. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
