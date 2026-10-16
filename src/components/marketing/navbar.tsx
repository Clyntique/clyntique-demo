"use client";

import { useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { MenuIcon, CloseIcon, ArrowRightIcon } from "@/components/ui/icons";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#workflow", label: "Workflow" },
  { href: "#features", label: "Features" },
  { href: "#policy-ai", label: "Policy AI" },
];

export function MarketingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-line/70 bg-surface/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-lg"
          aria-label="Clyntique Homepage"
        >
          <Brand size="md" className="select-none" />
        </Link>

        {/* Desktop Navigation Links */}
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-small font-medium text-ink-soft hover:text-brand-600 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/auth/login"
            className="text-small font-medium text-ink hover:text-brand-600 px-3 py-2 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/auth/login?mode=signup"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4.5 py-2.5 text-small font-medium text-white shadow-2xs hover:bg-brand-700 active:bg-brand-800 transition-all cursor-pointer"
          >
            <span>Get Started</span>
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="inline-flex items-center justify-center rounded-lg p-2 text-ink-soft hover:bg-subtle hover:text-ink transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-line bg-surface px-5 py-6 md:hidden shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <nav aria-label="Mobile Navigation" className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-body font-medium text-ink hover:text-brand-600 py-1 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="my-2 border-t border-line/80 pt-4 flex flex-col gap-3">
              <Link
                href="/auth/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center rounded-xl border border-line bg-surface py-2.5 text-small font-medium text-ink hover:bg-subtle transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth/login?mode=signup"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-small font-medium text-white shadow-xs hover:bg-brand-700 transition-all"
              >
                <span>Get Started</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
