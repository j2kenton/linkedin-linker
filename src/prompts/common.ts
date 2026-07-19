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

export const ESTIMATE_TABLE = "| Metric | Estimate | Unit / Currency | Confidence | Basis |";
export const ESTIMATE_ROW_RULES = `In sections 2 and 6, every financial, headcount, revenue, runway, and compensation number belongs in a table using exactly this header: ${ESTIMATE_TABLE}
Estimate is an ASCII numeric range low–high (for example 1.2M–2.0M or 85,000–110,000). Use an en dash (–, U+2013) in an Estimate range and an em dash (—, U+2014) in a Basis tag; do not swap them. A point value is allowed only for [verified — S#]. Use only ASCII digits, . decimals, optional , thousands separators, and optional k/M/B suffixes. Confidence is exactly high, medium, or low. Basis is either [verified — S#] using a supplied source ID or [modeled — assumptions: non-empty assumptions]. Do not put quantitative claims in prose in these sections.`;

export const wrapUntrusted = (label: string, value: string) =>
  `<UNTRUSTED_${label}>\n${value}\n</UNTRUSTED_${label}>`;
