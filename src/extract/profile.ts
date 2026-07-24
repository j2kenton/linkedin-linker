import type { ExtractWarning } from "./shared";
import { cleanText, capText, findText, metaContent, readJsonLd } from "./shared";

export type { ExtractWarning };
export interface ProfileExtraction { ready: boolean; name: string; headline: string; about: string; experience: string; education: string; skills: string; activity: string; warnings: ExtractWarning[]; }
const REQUIRED_FIELDS: (keyof Pick<ProfileExtraction, "name" | "headline" | "about" | "experience">)[] = ["name", "headline", "about", "experience"];

/**
 * Best-effort ladder: current profile-card selectors first (the only rung
 * that can report readiness on an all-empty page — see the sparse-fields
 * test), then JSON-LD Person data, then Open Graph metadata. Unlike the
 * generic-page extractor, this never falls back to raw visible text, so a
 * bare skeleton page keeps reporting not-ready and the popup's retry loop
 * keeps waiting for LinkedIn's SPA to finish mounting.
 */
export function extractProfile(document: Document): ProfileExtraction {
  const warnings: ExtractWarning[] = [];
  // A bare <main> (or LinkedIn's generic app shell, main.scaffold-layout__main)
  // renders on nearly every LinkedIn route, including job and feed pages, so
  // readiness must key off a container that only exists on a profile page.
  const profileRoot = document.querySelector(".pv-top-card, [data-view-name='profile-card']");
  let structureFound = Boolean(profileRoot);
  let bestEffort = !profileRoot;

  const section = (id: string) => document.querySelector(`#${id}`)?.closest("section") || document.querySelector(`section[data-section="${id}"]`);
  const collect = (node: Element | null) => node ? Array.from(node.querySelectorAll("li")).map(item => cleanText(item.textContent)).filter(Boolean).join("\n") : "";

  const result: ProfileExtraction = { ready:false, name:"", headline:"", about:"", experience:"", education:"", skills:"", activity:"", warnings };
  if (profileRoot) {
    // h1/headline lookups must be scoped to the profile card, not
    // document.body — the global nav and promo rails also contain
    // h1/.text-body-medium elements that would otherwise win the match.
    const main = profileRoot;
    result.name = findText(main, ["h1"]);
    result.headline = findText(main, [".text-body-medium", ".top-card-layout__headline"]);
    result.about = findText(section("about") || main, ["[data-generated-suggestion-target]", ".inline-show-more-text"]);
    result.experience = collect(section("experience"));
    result.education = collect(section("education"));
    result.skills = collect(section("skills"));
    result.activity = collect(section("activity"));
  }

  if (!result.name && !result.headline) {
    const person = readJsonLd(document, ["Person"])[0];
    if (person) {
      structureFound = true;
      bestEffort = true;
      result.name = cleanText(person.name);
      result.headline = cleanText(person.jobTitle || person.description);
    }
  }

  if (!result.name && !result.headline) {
    const metaTitle = metaContent(document, ["og:title"]);
    const metaDescription = metaContent(document, ["og:description", "description"]);
    if (metaTitle || metaDescription) {
      structureFound = true;
      bestEffort = true;
      result.name = metaTitle;
      result.headline = metaDescription;
    }
  }

  if (!structureFound) return { ready:false, name:"", headline:"", about:"", experience:"", education:"", skills:"", activity:"", warnings:[{ field:"page", message:"This does not look like a rendered LinkedIn profile page yet." }] };

  result.ready = true;
  if (bestEffort) warnings.push({ field:"page", message:"Best-effort extraction: this doesn't look like a fully rendered LinkedIn profile page, so only limited details were found." });
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
  fields.forEach(key => { result[key] = capText(result[key], 6000, String(key), warnings); });
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

/** Formats a profile extraction as labelled prose for the Career input fields (never raw JSON, so it reads naturally alongside manual notes). */
export function formatProfileProse(profile: ProfileExtraction): string {
  const blocks: string[] = [];
  if (profile.name || profile.headline) blocks.push([profile.name, profile.headline].filter(Boolean).join(" — "));
  if (profile.about) blocks.push(`About: ${profile.about}`);
  if (profile.experience) blocks.push(`Experience:\n${profile.experience}`);
  if (profile.education) blocks.push(`Education:\n${profile.education}`);
  if (profile.skills) blocks.push(`Skills:\n${profile.skills}`);
  if (profile.activity) blocks.push(`Recent activity:\n${profile.activity}`);
  return blocks.join("\n\n");
}
