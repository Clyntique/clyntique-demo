"use client";

import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from "react";
import { demoReducer, initialDemoState, isDemoState, type DemoAction, type DemoState } from "@/lib/demo/store";

const STORAGE_KEY = "clyntique-demo-sandbox-v1";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A store action without its timestamp; the provider adds `at`. */
export type DemoActionInput = DistributiveOmit<DemoAction, "at">;

interface DemoContextValue {
  state: DemoState;
  dispatch: Dispatch<DemoAction>;
  /** Wraps dispatch with the current time; every store action carries `at`. */
  act: (action: DemoActionInput) => void;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function reducerWithHydrate(state: DemoState, action: DemoAction | { type: "HYDRATE"; state: DemoState }): DemoState {
  if (action.type === "HYDRATE") return action.state;
  return demoReducer(state, action);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducerWithHydrate, undefined, initialDemoState);
  const hydrated = useRef(false);

  // The seed renders on the server; the browser's own session copy replaces it
  // after mount so the markup matches on hydration.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isDemoState(parsed)) dispatch({ type: "HYDRATE", state: parsed });
      }
    } catch {
      // Storage unavailable or corrupt: keep the seed.
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors; the demo keeps working in memory.
    }
  }, [state]);

  const value: DemoContextValue = {
    state,
    dispatch,
    act: (action) => dispatch({ ...action, at: new Date().toISOString() } as DemoAction),
    reset: () => {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      dispatch({ type: "RESET" });
    },
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Deterministic (UTC) so server and browser render the same text. */
export function formatDemoTime(iso: string): string {
  return `${TIME.format(new Date(iso))} UTC`;
}
