"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, ShieldIcon, SparklesIcon } from "@/components/ui/icons";

const HERO_BG_SRC = "/images/hero/hero-bg-v2.png";
const CLOUDS_SRC = "/images/hero/clouds.png";

// The cloud artwork is cut flush to its left and bottom edges; feather those
// edges so no straight line shows once the cloud overhangs the next section.
// Applied to the <img>, so the mirrored right cloud is feathered on its right.
const CLOUD_MASK =
  "linear-gradient(to top, transparent 0%, #000 16%), linear-gradient(to right, transparent 0%, #000 10%)";
const cloudMaskStyle = {
  maskImage: CLOUD_MASK,
  maskComposite: "intersect",
  WebkitMaskImage: CLOUD_MASK,
  WebkitMaskComposite: "source-in",
} as React.CSSProperties;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/*
 * Scroll-linked cloud transition.
 *
 * The hero sits in a tall track and pins (sticky) under the navbar. Progress
 * is read from the track's position once per animation frame, so the effect is
 * a pure function of scroll position: it reverses exactly on scroll-up and
 * never replays. Only transform and opacity are written.
 *
 * cover (0 -> 1, while pinned): the clouds travel from the bottom corners to
 *   the centre, grow and overlap; the copy fades; an off-white mist fills in
 *   behind them until the hero is fully obscured.
 * clear (0 -> 1, as the pinned hero scrolls away): the clouds drift with a
 *   slower parallax over the top of the next section and thin out. The mist
 *   matches that section's background, so there is no visible seam.
 *
 * Reduced motion: the track collapses to the hero's height, nothing pins, the
 * listener is never attached, and the clouds rest at the corners.
 */
export function HeroSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mistRef = useRef<HTMLDivElement>(null);
  const leftCloudRef = useRef<HTMLDivElement>(null);
  const rightCloudRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!track || !stage) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let stickyTop = 0;
    let pinDistance = 1;
    let stageHeight = 1;
    let viewportWidth = 1;
    let active = false;

    const measure = () => {
      stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
      stageHeight = stage.offsetHeight || 1;
      pinDistance = Math.max(1, track.offsetHeight - stageHeight);
      viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    };

    const render = () => {
      frame = 0;
      const scrolled = stickyTop - track.getBoundingClientRect().top;
      const cover = clamp01(scrolled / pinDistance);
      const clear = clamp01((scrolled - pinDistance) / (stageHeight * 0.9));
      const c = easeInOut(cover);

      // Clouds: corner -> centre, growing, then a slow parallax drift + thin-out.
      const travelX = c * viewportWidth * 0.3;
      const rise = c * stageHeight * 0.28;
      const drift = clear * stageHeight * 0.45;
      const scale = 1 + c * 1.35 + clear * 0.6;
      const cloudOpacity = 1 - smoothstep(0.15, 1, clear);
      const y = drift - rise;

      if (leftCloudRef.current) {
        leftCloudRef.current.style.transform = `translate3d(${travelX}px, ${y}px, 0) scale(${scale})`;
        leftCloudRef.current.style.opacity = String(cloudOpacity);
      }
      if (rightCloudRef.current) {
        // Slightly lower and smaller than the left so the mirrored art never reads as symmetric.
        rightCloudRef.current.style.transform = `translate3d(${-travelX}px, ${drift - rise * 0.82}px, 0) scale(${scale * 0.94})`;
        rightCloudRef.current.style.opacity = String(cloudOpacity);
      }

      // Mist completes the coverage so no gaps between the clouds show through.
      if (mistRef.current) {
        mistRef.current.style.opacity = String(smoothstep(0.35, 0.92, cover));
      }

      // Background eases forward, as if flying into the clouds.
      if (bgRef.current) {
        bgRef.current.style.transform = `scale(${1 + c * 0.12})`;
      }

      if (contentRef.current) {
        const contentOpacity = 1 - smoothstep(0.05, 0.55, cover);
        contentRef.current.style.opacity = String(contentOpacity);
        contentRef.current.style.transform = `translate3d(0, ${-c * stageHeight * 0.08}px, 0) scale(${1 - c * 0.05})`;
        // Hidden copy must not catch clicks or focus-scroll surprises.
        contentRef.current.style.pointerEvents = contentOpacity < 0.1 ? "none" : "";
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    const onResize = () => {
      measure();
      schedule();
    };

    const resizeObserver = new ResizeObserver(onResize);

    const start = () => {
      if (active) return;
      active = true;
      measure();
      render();
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      resizeObserver.observe(track);
    };

    const stop = () => {
      if (!active) return;
      active = false;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      // Drop inline styles so the reduced-motion resting layout applies.
      for (const el of [bgRef, contentRef, mistRef, leftCloudRef, rightCloudRef]) {
        el.current?.removeAttribute("style");
      }
    };

    const sync = () => (motionQuery.matches ? stop() : start());
    sync();
    motionQuery.addEventListener("change", sync);

    return () => {
      motionQuery.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return (
    // The track supplies the pinned scroll distance (80svh, kept short so the
    // page never feels scroll-trapped). overflow-x-clip stops the
    // travelling clouds from causing horizontal scroll without breaking sticky
    // or clipping the clouds' overhang into the next section.
    <div
      ref={trackRef}
      className="relative z-20 w-full overflow-x-clip h-[calc(100svh-4.5rem+80svh)] motion-reduce:h-auto"
    >
      <section
        ref={stageRef}
        aria-label="Creative work hero"
        className="sticky top-18 flex h-[calc(100svh-4.5rem)] min-h-[560px] w-full items-center justify-center bg-[#0A111E] motion-reduce:static"
      >
        {/* Background image (clipped separately so the clouds can overhang). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div ref={bgRef} className="absolute inset-0 will-change-transform">
            <Image
              src={HERO_BG_SRC}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-[center_40%]"
            />
          </div>
          {/* Navy wash for text contrast and depth. */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A111E]/60 via-[#1A2C48]/45 to-[#1A2C48]/20" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_35%,_rgba(0,0,0,0.35)_100%)]" />
        </div>

        <div
          ref={contentRef}
          className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pb-24 pt-10 text-center will-change-[transform,opacity] sm:px-6 md:pb-32 lg:px-8"
        >
          <div className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-gold-300/40 bg-[#1A2C48]/85 px-4 py-1.5 shadow-sm backdrop-blur-md transition-colors hover:border-gold-300/70">
            <SparklesIcon className="size-3.5 text-gold-300 animate-pulse" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-200">
              Creative Collaboration & Review
            </span>
          </div>

          <h1 className="font-heading mt-6 text-balance text-4xl font-bold tracking-tight text-white drop-shadow-md sm:text-5xl md:text-6xl lg:text-7xl leading-[1.18] sm:leading-[1.14]">
            Creative work, without the back-and-forth.
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-base font-normal leading-relaxed text-slate-100 sm:text-lg md:text-xl drop-shadow">
            Bring creative submissions, feedback, evidence, revisions, and approvals into one shared workspace.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4 w-full sm:w-auto">
            <Link
              href="/auth/login?mode=signup"
              className="group inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-gold-500 px-8 py-3.5 text-base font-semibold text-brand-900 shadow-md hover:bg-gold-600 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:bg-gold-700 transition-all duration-200 cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRightIcon className="size-4.5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-7 py-3.5 text-base font-medium text-white backdrop-blur-md hover:bg-white/20 hover:border-white/50 hover:-translate-y-0.5 active:translate-y-0 active:bg-white/30 transition-all duration-200 cursor-pointer"
            >
              <span>Explore Demo</span>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-medium text-white/90 hover:text-white underline-offset-4 hover:underline transition-colors cursor-pointer"
            >
              <span>See How It Works</span>
            </a>
          </div>

          <div className="mt-12 hidden flex-wrap items-center justify-center gap-y-2.5 gap-x-6 text-caption text-slate-200/90 sm:flex">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 border border-white/10 backdrop-blur-sm">
              <CheckCircleIcon className="size-4 text-gold-400" />
              <span>Centralized Version Lineage</span>
            </div>
            <div className="text-white/30">·</div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 border border-white/10 backdrop-blur-sm">
              <ShieldIcon className="size-4 text-gold-400" />
              <span>Policy-Grounded Pre-Screening</span>
            </div>
            <div className="text-white/30">·</div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 border border-white/10 backdrop-blur-sm">
              <CheckCircleIcon className="size-4 text-gold-400" />
              <span>Clear Decision Accountability</span>
            </div>
          </div>
        </div>

        {/* Mist: matches the next section's white so full coverage hands over seamlessly. */}
        <div
          ref={mistRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 opacity-0 will-change-[opacity] bg-[radial-gradient(ellipse_at_50%_60%,_#FFFFFF_0%,_#F5F7FA_40%,_#FFFFFF_80%)] motion-reduce:hidden"
        />

        {/* Foreground cloud formations, overhanging into the next section. */}
        <div
          ref={leftCloudRef}
          aria-hidden
          className="pointer-events-none absolute -bottom-[8svh] -left-[28vw] z-30 w-[160vw] origin-bottom-left will-change-transform sm:-left-[14vw] sm:w-[110vw] lg:-left-[3vw] lg:w-[80vw]"
        >
          <Image src={CLOUDS_SRC} alt="" width={1376} height={768} sizes="(min-width: 1024px) 80vw, (min-width: 640px) 110vw, 160vw" className="h-auto w-full select-none" style={cloudMaskStyle} draggable={false} />
        </div>
        <div
          ref={rightCloudRef}
          aria-hidden
          className="pointer-events-none absolute -bottom-[8svh] -right-[28vw] z-30 w-[160vw] origin-bottom-right will-change-transform sm:-right-[14vw] sm:w-[110vw] lg:-right-[3vw] lg:w-[80vw]"
        >
          <Image src={CLOUDS_SRC} alt="" width={1376} height={768} sizes="(min-width: 1024px) 80vw, (min-width: 640px) 110vw, 160vw" className="h-auto w-full -scale-x-100 select-none" style={cloudMaskStyle} draggable={false} />
        </div>
      </section>
    </div>
  );
}
