import Link from "next/link";

export function Breadcrumb({ trail, current }: { trail: { label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-meta mb-3">
      {trail.map((t) => (
        <span key={t.href}>
          <Link href={t.href} className="hover:text-ink">
            {t.label}
          </Link>
          <span className="mx-1.5 text-faint">/</span>
        </span>
      ))}
      <span className="text-ink-soft">{current}</span>
    </nav>
  );
}
