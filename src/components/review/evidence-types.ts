import type { EvidenceType } from "@/generated/prisma/enums";

export const EVIDENCE_TYPES: Record<EvidenceType, string> = {
  RESEARCH: "Research",
  STATISTIC: "Statistic",
  COMPETITOR: "Competitor example",
  CUSTOMER_INSIGHT: "Customer insight",
  SOURCE: "Source material",
  CLINICAL_STUDY: "Clinical study",
  CERTIFICATION: "Certification or licence",
  POLICY_REFERENCE: "Policy reference",
  OTHER: "Other",
};
