"use client";

import React, { useEffect, useRef, useState } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  animation?: "fade-up" | "fade-in" | "scale-up" | "slide-left" | "slide-right";
  delayMs?: number;
  durationMs?: number;
  threshold?: number;
  className?: string;
  as?: React.ElementType;
}

export function useScrollReveal(threshold = 0.15, rootMargin = "0px 0px -40px 0px") {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, isVisible };
}

export function ScrollReveal({
  children,
  animation = "fade-up",
  delayMs = 0,
  durationMs = 700,
  threshold = 0.15,
  className = "",
  as: Component = "div",
}: ScrollRevealProps) {
  const { ref, isVisible } = useScrollReveal(threshold);

  const getAnimationStyles = (): React.CSSProperties => {
    const baseTransition: React.CSSProperties = {
      transitionProperty: "opacity, transform",
      transitionDuration: `${durationMs}ms`,
      transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      transitionDelay: `${delayMs}ms`,
      willChange: "opacity, transform",
    };

    if (!isVisible) {
      switch (animation) {
        case "fade-up":
          return {
            ...baseTransition,
            opacity: 0,
            transform: "translateY(28px)",
          };
        case "fade-in":
          return {
            ...baseTransition,
            opacity: 0,
          };
        case "scale-up":
          return {
            ...baseTransition,
            opacity: 0,
            transform: "scale(0.95)",
          };
        case "slide-left":
          return {
            ...baseTransition,
            opacity: 0,
            transform: "translateX(-28px)",
          };
        case "slide-right":
          return {
            ...baseTransition,
            opacity: 0,
            transform: "translateX(28px)",
          };
        default:
          return {
            ...baseTransition,
            opacity: 0,
            transform: "translateY(20px)",
          };
      }
    }

    return {
      ...baseTransition,
      opacity: 1,
      transform: "none",
    };
  };

  return (
    <Component ref={ref} style={getAnimationStyles()} className={className}>
      {children}
    </Component>
  );
}
