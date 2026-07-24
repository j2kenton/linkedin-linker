export const COMPANY_HEADINGS = [
  "## 1. Company Genesis & Strategic Profile",
  "## 2. Venture Capitalization & Financial Health Model",
  "## 3. Product Architecture & Technical Demands",
  "## 4. Reading Between the Lines",
  "## 5. Strategic Interview Alignment",
  "## 6. Compensation Benchmarking & Negotiation Architecture",
] as const;

export const INTERVIEW_HEADINGS = [
  "## Professional drivers and collaboration hypotheses",
  "## Communication and processing-style cues",
  "## Leadership and collaboration matching",
  "## Values and friction points",
  "## Priority candidate stories",
  "## Narrative blueprints",
] as const;

/** The single combined Career report: one adaptive report covering role/company/interviewer/prep in a fixed section order. */
export const COMBINED_HEADINGS = [
  "## 1. Role & Job Description Analysis",
  "## 2. Company Profile & Strategic Context",
  "## 3. Financial Health & Funding Model",
  "## 4. Interviewer Insights & Rapport Hypotheses",
  "## 5. Interview Strategy & Priority Stories",
  "## 6. Compensation Benchmarking & Negotiation",
  "## 7. Gaps, Assumptions & Open Questions",
] as const;

/** Exact marker a section must contain (and only contain) when the supplied context doesn't support writing it — never a fabricated substitute. */
export const INSUFFICIENT_CONTEXT_MARKER = "_Insufficient context supplied for this section._";

export const ESTIMATE_TABLE = "| Metric | Estimate | Unit / Currency | Confidence | Basis |";
export function estimateRowRules(sectionDescription: string): string {
  return `In ${sectionDescription}, every financial, headcount, revenue, runway, and compensation number belongs in a table using exactly this header: ${ESTIMATE_TABLE}
Estimate is an ASCII numeric range low–high (for example 1.2M–2.0M or 85,000–110,000). Use an en dash (–, U+2013) in an Estimate range and an em dash (—, U+2014) in a Basis tag; do not swap them. A point value is allowed only for [verified — S#]. Use only ASCII digits, . decimals, optional , thousands separators, and optional k/M/B suffixes. Confidence is exactly high, medium, or low. Basis is either [verified — S#] using a supplied source ID or [modeled — assumptions: non-empty assumptions]. Do not put quantitative claims in prose in these sections.`;
}
export const ESTIMATE_ROW_RULES = estimateRowRules("sections 2 and 6");

export const wrapUntrusted = (label: string, value: string) =>
  `<UNTRUSTED_${label}>\n${value}\n</UNTRUSTED_${label}>`;
