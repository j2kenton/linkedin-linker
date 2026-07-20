export interface ExtractWarning { field: string; message: string; }
export interface ProfileExtraction { ready: boolean; name: string; headline: string; about: string; experience: string; education: string; skills: string; activity: string; warnings: ExtractWarning[]; }
const cap = (text: string, max: number, field: string, warnings: ExtractWarning[]) => text.length > max ? (warnings.push({ field, message: `Truncated to ${max} characters.` }), `${text.slice(0, max)}…`) : text;
const text = (root: ParentNode, selector: string) => (root.querySelector(selector)?.textContent || "").replace(/\s+/g, " ").trim();
const REQUIRED_FIELDS: (keyof Pick<ProfileExtraction, "name" | "headline" | "about" | "experience">)[] = ["name", "headline", "about", "experience"];

export function extractProfile(document: Document): ProfileExtraction {
  const warnings: ExtractWarning[] = [];
  // A bare <main> (or LinkedIn's generic app shell, main.scaffold-layout__main)
  // renders on nearly every LinkedIn route, including job and feed pages, so
  // readiness must key off a container that only exists on a profile page.
  // Falling back to any <main> let EXTRACT_PROFILE report ready:true with
  // empty fields on a non-profile page.
  const profileRoot = document.querySelector(".pv-top-card, [data-view-name='profile-card']");
  if (!profileRoot) return { ready: false, name: "", headline: "", about: "", experience: "", education: "", skills: "", activity: "", warnings: [{ field: "page", message: "This does not look like a rendered LinkedIn profile page yet." }] };
  // h1/headline lookups must be scoped to the profile card, not document.body —
  // the global nav and promo rails also contain h1/.text-body-medium elements
  // that would otherwise win the match on a profile page.
  const main = profileRoot;
  const section = (id: string) => document.querySelector(`#${id}`)?.closest("section") || document.querySelector(`section[data-section="${id}"]`);
  const collect = (node: Element | null) => node ? Array.from(node.querySelectorAll("li")).map(item => (item.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") : "";
  const result: ProfileExtraction = {
    ready: true,
    name: text(main, "h1"),
    headline: text(main, ".text-body-medium") || text(main, ".top-card-layout__headline"),
    about: text(section("about") || main, "[data-generated-suggestion-target], .inline-show-more-text"),
    experience: collect(section("experience")), education: collect(section("education")), skills: collect(section("skills")), activity: collect(section("activity")), warnings
  };
  for (const field of REQUIRED_FIELDS) {
    if (!result[field]) warnings.push({ field, message: `${field} was not found on the page.` });
  }
  // Experience/education/skills/activity mount lazily as the user scrolls, so
  // a page that loaded fine (name/headline present) can still report an
  // otherwise-successful extraction with every lower section empty.
  if (result.name && result.headline && !result.experience && !result.education && !result.skills && !result.activity) {
    warnings.push({ field: "sections", message: "Experience, education, skills, and activity may not have loaded yet — scroll the profile into view and retry." });
  }
  const fields: (keyof Pick<ProfileExtraction, "name" | "headline" | "about" | "experience" | "education" | "skills" | "activity">)[] = ["name", "headline", "about", "experience", "education", "skills", "activity"];
  fields.forEach(key => { result[key] = cap(result[key], 6000, String(key), warnings); });
  const total = [result.name, result.headline, result.about, result.experience, result.education, result.skills, result.activity].join("\n");
  if (total.length > 30000) {
    let excess = total.length - 30000;
    // Keep identity fields intact and trim lower-priority, verbose sections first.
    for (const field of ["activity", "skills", "education", "experience", "about"] as const) {
      if (excess <= 0) break;
      const remove = Math.min(excess, result[field].length);
      result[field] = result[field].slice(0, result[field].length - remove);
      excess -= remove;
      warnings.push({ field, message: "Trimmed to keep the combined profile payload within 30,000 characters." });
    }
  }
  return result;
}
