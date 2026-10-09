import type { EvidenceType } from "@/generated/prisma/enums";

export const EVIDENCE_TYPES: Record<EvidenceType, string> = {
  RESEARCH: "Research",
  STATISTIC: "Statistic",
  COMPETITOR: "Competitor example",
  CUSTOMER_INSIGHT: "Customer insight",
  SOURCE: "Source material",
  OTHER: "Other",
};
