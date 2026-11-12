"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { searchGlobal } from "@/lib/search/actions";
import type { SearchResponse, SearchResultItem } from "@/lib/search/types";
import {
  SearchIcon,
  CloseIcon,
  FolderIcon,
  ImageIcon,
  BookOpenIcon,
  FileTextIcon,
  ShieldIcon,
  ArrowRightIcon,
  LayersIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

function CategoryIcon({ iconName, className }: { iconName?: string; className?: string }) {
  switch (iconName) {
    case "FolderIcon":
      return <FolderIcon className={className} />;
    case "ImageIcon":
      return <ImageIcon className={className} />;
    case "BookOpenIcon":
      return <BookOpenIcon className={className} />;
    case "DocumentIcon":
      return <FileTextIcon className={className} />;
    case "ShieldIcon":
      return <ShieldIcon className={className} />;
    case "CompassIcon":
    default:
      return <LayersIcon className={className} />;
  }
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestSeqRef = useRef(0);

  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Flattened items for simple keyboard arrow traversal
  const flatItems = useMemo<SearchResultItem[]>(() => {
    if (!response?.groups) return [];
    return response.groups.flatMap((g) => g.items);
  }, [response]);

  // Execute search
  const performSearch = useCallback(async (q: string) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await searchGlobal(q);
      if (seq === requestSeqRef.current) {
        setResponse(res);
        setSelectedIndex(0);
        setLoading(false);
      }
    } catch (err: unknown) {
      if (seq === requestSeqRef.current) {
        setError(err instanceof Error ? err.message : "Search failed. Please try again.");
        setLoading(false);
      }
    }
  }, []);

  // When palette opens
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = "";
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [isOpen]);

  // Debounced search on query or open state change
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      void performSearch(query);
    }, 150);

    return () => clearTimeout(timer);
  }, [query, isOpen, performSearch]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector('[aria-selected="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (flatItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = flatItems[selectedIndex];
      if (selected) {
        router.push(selected.href);
        onClose();
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelectedIndex(flatItems.length - 1);
    }
  };

  const handleSelectItem = (item: SearchResultItem) => {
    router.push(item.href);
    onClose();
  };

  if (!isOpen) return null;

  let currentFlatIndex = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global search and command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-20 px-3 sm:px-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 sm:px-4 sm:py-3">
          <SearchIcon className="size-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, submissions, evidence, policies..."
            className="w-full bg-transparent text-small sm:text-body text-ink placeholder:text-muted focus:outline-none"
            aria-autocomplete="list"
            aria-controls="search-results-list"
            aria-activedescendant={
              flatItems[selectedIndex] ? `result-${flatItems[selectedIndex].id}` : undefined
            }
          />
          {loading && (
            <div
              className="size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent shrink-0"
              aria-label="Loading search results"
            />
          )}
          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="rounded p-1 text-muted hover:bg-subtle hover:text-ink cursor-pointer"
              aria-label="Clear search input"
            >
              <CloseIcon className="size-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-micro text-muted">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div
          id="search-results-list"
          ref={listRef}
          role="listbox"
          className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-line/40 focus:outline-none"
        >
          {error && (
            <div className="p-4 text-center text-small text-negative-ink bg-negative-subtle/30 rounded-lg m-2">
              <p className="font-medium">Search encountered an issue</p>
              <p className="text-micro mt-1 text-muted">{error}</p>
            </div>
          )}

          {!loading && !error && response && response.totalHits === 0 && query.length >= 2 && (
            <div className="py-12 px-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-subtle text-muted mb-3">
                <SearchIcon className="size-6" />
              </div>
              <h3 className="text-small font-semibold text-ink">No results found</h3>
              <p className="text-caption text-muted mt-1 max-w-sm mx-auto">
                No matching projects, submissions, evidence, or policies for &ldquo;{query}&rdquo;.
              </p>
            </div>
          )}

          {response?.groups.map((group) => {
            return (
              <div key={group.category} className="py-2 first:pt-0 last:pb-0">
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {group.label}
                </div>
                <div className="mt-1 space-y-0.5">
                  {group.items.map((item) => {
                    const itemIndex = currentFlatIndex++;
                    const isSelected = itemIndex === selectedIndex;

                    return (
                      <div
                        key={item.id}
                        id={`result-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={cn(
                          "group flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-small transition-colors cursor-pointer select-none",
                          isSelected
                            ? "bg-brand-500 text-white"
                            : "text-ink hover:bg-subtle"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-md border",
                              isSelected
                                ? "border-brand-400 bg-brand-600/50 text-white"
                                : "border-line bg-surface text-muted group-hover:text-ink"
                            )}
                          >
                            <CategoryIcon iconName={item.iconName} className="size-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{item.title}</div>
                            {item.subtitle && (
                              <div
                                className={cn(
                                  "truncate text-caption",
                                  isSelected ? "text-brand-100" : "text-muted"
                                )}
                              >
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.badge && (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                                isSelected
                                  ? "bg-brand-600/60 text-white border border-brand-400"
                                  : "bg-subtle text-muted border border-line"
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                          <ArrowRightIcon
                            className={cn(
                              "size-3.5 transition-transform group-hover:translate-x-0.5",
                              isSelected ? "text-white" : "text-muted/60"
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="flex items-center justify-between border-t border-line bg-subtle/50 px-3.5 py-2 text-caption text-muted">
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1">
              <kbd className="rounded border border-line bg-surface px-1 text-[10px] font-mono">↑</kbd>
              <kbd className="rounded border border-line bg-surface px-1 text-[10px] font-mono">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-line bg-surface px-1 text-[10px] font-mono">↵</kbd>
              <span>select</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-line bg-surface px-1 text-[10px] font-mono">esc</kbd>
              <span>close</span>
            </span>
          </div>

          {response && (
            <div className="text-[11px] font-mono text-muted">
              {response.totalHits} hit{response.totalHits === 1 ? "" : "s"} · {response.durationMs}ms
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
