import Link from "next/link";

export function Breadcrumb({ trail, current }: { trail: { label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 min-w-0">
      <ol className="text-small flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
        {trail.map((t) => (
          <li key={t.href} className="flex min-w-0 items-center gap-1.5">
            <Link href={t.href} className="truncate rounded-sm hover:text-ink">
              {t.label}
            </Link>
            <span aria-hidden className="text-faint">
              /
            </span>
          </li>
        ))}
        <li aria-current="page" className="min-w-0 truncate text-ink-soft">
          {current}
        </li>
      </ol>
    </nav>
  );
}
