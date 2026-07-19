import { COMPANY_HEADINGS, ESTIMATE_TABLE, INTERVIEW_HEADINGS } from "../prompts/common";

export interface ValidationFinding {
  section?: string;
  message: string;
  kind: "schema" | "citation" | "estimate" | "prohibited";
  /** Raw markdown line the finding applies to, so a renderer can flag the exact row/claim instead of only the section. */
  line?: string;
}

export interface Validation {
  valid: boolean;
  missing: string[];
  duplicated: string[];
  extra: string[];
  prohibited: string[];
  findings: ValidationFinding[];
  invalidEstimateSections: string[];
  withheldSections: string[];
}

const prohibited = /\b(deception|hostility|manipulat(?:e|ion)|psychopath|sociopath|diagnos(?:e|is|tic)|mental illness|protected trait|race|ethnicity|religion|sexuality|disability)\b/ig;

// Commas are thousands separators only. In particular, this rejects locale
// decimals such as `1,2M`, which would otherwise be read as twelve million.
const canonicalNumber =
  "(?:0(?:\\.\\d+)?|[1-9]\\d*(?:\\.\\d+)?|[1-9]\\d{0,2}(?:,\\d{3})+(?:\\.\\d+)?)";
const range = new RegExp(`^(${canonicalNumber}[kMB]?)\\s*[–-]\\s*(${canonicalNumber}[kMB]?)$`);
const point = new RegExp(`^${canonicalNumber}[kMB]?$`);
const numericClaim = /(?:[$€£]|\b(?:USD|EUR|ILS|GBP)\b|\b\d+(?:\.\d+)?\s*(?:k|M|B|%|months?|employees?|headcount|runway)\b)/i;

function numberValue(raw: string): number {
  const suffix = raw.slice(-1);
  const multiplier = suffix === "k" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return Number(raw.replace(/[kMB,]/g, "")) * multiplier;
}

function sectionText(markdown: string, heading: string, headings: readonly string[]): string {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";

  const rest = markdown.slice(start + heading.length);
  const next = headings
    .map(candidate => rest.indexOf(candidate))
    .filter(index => index >= 0)
    .sort((left, right) => left - right)[0];
  return next === undefined ? rest : rest.slice(0, next);
}

function addSchemaFindings(
  findings: ValidationFinding[],
  missing: string[],
  duplicated: string[],
  extra: string[],
): void {
  missing.forEach(message => findings.push({ kind: "schema", message: `Missing heading: ${message}` }));
  duplicated.forEach(message => findings.push({ kind: "schema", message: `Duplicate heading: ${message}` }));
  extra.forEach(message => findings.push({ kind: "schema", message: `Unknown heading: ${message}` }));
}

/** Flags a report whose present, non-duplicated expected headings appear out of the required order. */
function findOutOfOrderHeadings(headings: string[], expected: readonly string[]): boolean {
  const present = headings.filter(heading => expected.includes(heading) && headings.filter(item => item === heading).length === 1);
  const order = present.map(heading => expected.indexOf(heading));
  return order.some((index, position) => position > 0 && index < order[position - 1]);
}

function validateCitations(
  markdown: string,
  sourceIds: string[],
  stageBOnly: boolean,
  findings: ValidationFinding[],
): void {
  for (const marker of markdown.match(/\[S\d+\]/g) || []) {
    if (stageBOnly || !sourceIds.includes(marker.slice(1, -1))) {
      findings.push({ kind: "citation", message: `Unresolvable citation ${marker}` });
    }
  }

  for (const verified of markdown.match(/\[verified\s+[—-]\s+S\d+\]/gi) || []) {
    const id = verified.match(/S\d+/)?.[0] || "";
    if (stageBOnly || !sourceIds.includes(id)) {
      findings.push({ kind: "citation", message: `Unresolvable verified basis ${verified}` });
    }
  }
}

function validateEstimateRow(
  line: string,
  sourceIds: string[],
  stageBOnly: boolean,
): boolean {
  const cells = line.trim().split("|").slice(1, -1).map(cell => cell.trim());
  if (cells.length !== 5) return false;

  const [metric, estimate, unit, confidence, basis] = cells;
  let invalid = !metric || !unit || !["high", "medium", "low"].includes(confidence);
  const verified = /^\[verified\s+[—-]\s+(S\d+)\]$/i.exec(basis);
  const modeled = /^\[modeled\s+[—-]\s+assumptions:\s*.+\]$/i.test(basis);
  const matchedRange = range.exec(estimate);

  if (matchedRange) {
    invalid ||= numberValue(matchedRange[1]) > numberValue(matchedRange[2]);
  } else if (!(verified && point.test(estimate))) {
    invalid = true;
  }

  if (!verified && !modeled) invalid = true;
  if (verified && (stageBOnly || !sourceIds.includes(verified[1]))) invalid = true;
  return invalid;
}

function validateEstimateSection(
  markdown: string,
  heading: string,
  sourceIds: string[],
  stageBOnly: boolean,
  findings: ValidationFinding[],
): boolean {
  const body = sectionText(markdown, heading, COMPANY_HEADINGS);
  const allLines = body.split(/\r?\n/);

  // Scanned per line (not as one joined blob) so every out-of-table
  // quantitative claim gets its own finding with the exact source line,
  // letting the renderer flag that specific claim instead of only the
  // containing section.
  for (const rawLine of allLines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("|")) continue;
    if (numericClaim.test(trimmed.replace(/\b(?:19|20)\d{2}\b/g, ""))) {
      findings.push({
        kind: "estimate",
        section: heading,
        message: "Quantitative claim appears outside an estimate table",
        line: rawLine,
      });
    }
  }

  const lines = allLines.filter(line => line.trim().startsWith("|"));
  const headerIndex = lines.findIndex(line => line.trim().toLowerCase() === ESTIMATE_TABLE.toLowerCase());
  if (headerIndex < 0) {
    findings.push({ kind: "estimate", section: heading, message: "Required estimate table header is missing" });
    return true;
  }

  for (const line of lines.slice(headerIndex + 2)) {
    if (!validateEstimateRow(line, sourceIds, stageBOnly)) continue;
    findings.push({ kind: "estimate", section: heading, message: `Malformed estimate row: ${line}`, line });
  }

  return findings.some(finding => finding.kind === "estimate" && finding.section === heading);
}

/** Lexical validation of report shape; it validates structure, never factual truth. */
export function validateReport(
  markdown: string,
  kind: "company" | "interview",
  sourceIds: string[] = [],
  stageBOnly = false,
): Validation {
  const expected: readonly string[] = kind === "company" ? [...COMPANY_HEADINGS] : [...INTERVIEW_HEADINGS];
  const headings: string[] = markdown.match(/^## .+$/gm) || [];
  const findings: ValidationFinding[] = [];
  const missing = expected.filter(heading => !headings.includes(heading));
  const duplicated = expected.filter(heading => headings.filter(item => item === heading).length > 1);
  const extra = headings.filter(heading => !expected.includes(heading));

  addSchemaFindings(findings, missing, duplicated, extra);
  if (findOutOfOrderHeadings(headings, expected)) findings.push({ kind: "schema", message: "Headings appear out of the required order" });
  validateCitations(markdown, sourceIds, stageBOnly, findings);

  const prohibitedFound = kind === "interview" ? (markdown.match(prohibited) || []) : [];
  const withheldSections: string[] = [];
  if (prohibitedFound.length) {
    const unique = [...new Set(prohibitedFound.map(value => value.toLowerCase()))];
    unique.forEach(message => findings.push({ kind: "prohibited", message }));
    for (const heading of expected) {
      prohibited.lastIndex = 0;
      if (prohibited.test(sectionText(markdown, heading, expected))) withheldSections.push(heading);
    }
  }

  const invalidEstimateSections: string[] = [];
  if (kind === "company") {
    for (const heading of [COMPANY_HEADINGS[1], COMPANY_HEADINGS[5]]) {
      if (validateEstimateSection(markdown, heading, sourceIds, stageBOnly, findings)) {
        invalidEstimateSections.push(heading);
      }
    }
  }

  return {
    valid: findings.length === 0,
    missing,
    duplicated,
    extra,
    prohibited: prohibitedFound,
    findings,
    invalidEstimateSections: [...new Set(invalidEstimateSections)],
    withheldSections: [...new Set(withheldSections)],
  };
}
