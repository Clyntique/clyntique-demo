import type { CreativeFormat } from "@/generated/prisma/enums";

// Display details for each creative format. Safe to import from client code.
export const FORMATS: Record<CreativeFormat, { label: string; ratio: string }> = {
  STORY: { label: "Story", ratio: "9:16" },
  FEED: { label: "Feed post", ratio: "4:5" },
  STATIC: { label: "Static", ratio: "1.91:1" },
  VIDEO: { label: "Video", ratio: "16:9" },
};

export const FORMAT_ORDER: CreativeFormat[] = ["STORY", "FEED", "STATIC", "VIDEO"];
