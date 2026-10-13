import Image from "next/image";
import { cn } from "@/lib/cn";
import logo from "./brand-assets/clyntique-logo.png";
import mark from "./brand-assets/clyntique-mark.png";
import wordmark from "./brand-assets/clyntique-wordmark.png";

/*
 * The official Clyntique logo (brand kit, 13 Oct 2026): the hexagonal C mark
 * and the CLYNTIQUE wordmark, cut from the supplied logo.png. Only the white
 * background was made transparent; the artwork itself is unchanged. Files are
 * at twice their largest display size.
 *
 * Always shown on light surfaces: on navy the mark's navy half and the
 * wordmark disappear. The favicon (src/app/icon.svg) stays as it is until a
 * small-size version is approved.
 */
const SIZES = {
  md: { mark: 40, word: 124 },
  lg: { mark: 56, word: 176 },
} as const;

const heightFor = (img: { width: number; height: number }, width: number) => Math.round((img.height / img.width) * width);

export function BrandMark({ className, width = SIZES.md.mark }: { className?: string; width?: number }) {
  return (
    <Image
      src={mark}
      alt=""
      aria-hidden
      width={width}
      height={heightFor(mark, width)}
      unoptimized
      loading="eager"
      className={cn("shrink-0 select-none", className)}
    />
  );
}

export function Brand({ className, size = "md" }: { className?: string; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark width={s.mark} />
      <Image
        src={wordmark}
        alt="Clyntique"
        width={s.word}
        height={heightFor(wordmark, s.word)}
        unoptimized
        loading="eager"
        className="shrink-0 select-none"
      />
    </span>
  );
}

/** The full primary logo (mark above the wordmark), for brand panels such as sign-in. */
export function BrandLogo({ className, width = 200 }: { className?: string; width?: number }) {
  return (
    <Image
      src={logo}
      alt="Clyntique"
      width={width}
      height={heightFor(logo, width)}
      unoptimized
      loading="eager"
      fetchPriority="high"
      className={cn("select-none", className)}
    />
  );
}
