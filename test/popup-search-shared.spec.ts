// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { attachClearButtons, extractFreeText, generateLinkedInURL, resolveCompanyNameSource } from "../src/popup-search-shared";

const OWNER_URL = "https://www.linkedin.com/search/results/people/?keywords=servicenow&origin=FACETED_SEARCH&currentCompany=%5B%2229352%22%5D";

describe("extractFreeText", () => {
  it("reads keywords when the URL has no titleFreeText", () => {
    expect(extractFreeText(OWNER_URL)).toBe("servicenow");
  });

  it("prefers titleFreeText from a generated URL and does not re-add the company name", () => {
    const url = generateLinkedInURL({
      companyName: "ServiceNow", companiesIds: "", titleOfProspect: "Software Engineering Manager",
      locationIds: "", connectionDegree: [], startPage: 1,
    });
    expect(extractFreeText(url)).toBe("Software Engineering Manager");
  });

  it("strips the appended company name when only a company was entered", () => {
    const url = generateLinkedInURL({
      companyName: "ServiceNow", companiesIds: "", titleOfProspect: "",
      locationIds: "", connectionDegree: [], startPage: 1,
    });
    expect(extractFreeText(url)).toBeNull();
  });

  it("keeps keywords that end with the company text when no company parameter is present", () => {
    expect(extractFreeText("https://www.linkedin.com/search/results/people/?keywords=work%20at%20acme")).toBe("work at acme");
  });

  it("returns null for a URL without keywords and for unparseable input", () => {
    expect(extractFreeText("https://www.linkedin.com/search/results/people/?page=2")).toBeNull();
    expect(extractFreeText("not a url")).toBeNull();
  });
});

describe("resolveCompanyNameSource", () => {
  it("recognises a LinkedIn company page", () => {
    expect(resolveCompanyNameSource("https://www.linkedin.com/company/servicenow/")).toEqual({ kind: "companyPage" });
  });

  it("uses the company parameter of a people search", () => {
    const url = "https://www.linkedin.com/search/results/people/?company=ServiceNow&keywords=ServiceNow";
    expect(resolveCompanyNameSource(url)).toEqual({ kind: "name", name: "ServiceNow" });
  });

  it("reports ID-only for a currentCompany-only search and never treats the ID as a name", () => {
    expect(resolveCompanyNameSource(OWNER_URL)).toEqual({ kind: "idOnly", ids: ["29352"] });
  });

  it("reports none for a people search with neither company name nor ID", () => {
    expect(resolveCompanyNameSource("https://www.linkedin.com/search/results/people/?keywords=x")).toEqual({ kind: "none" });
  });

  it("reports wrongPage for non-LinkedIn and other LinkedIn pages", () => {
    expect(resolveCompanyNameSource("https://example.com/company/acme")).toEqual({ kind: "wrongPage" });
    expect(resolveCompanyNameSource("https://www.linkedin.com/feed/")).toEqual({ kind: "wrongPage" });
  });

  it("does not accept a LinkedIn search path embedded in a non-LinkedIn URL", () => {
    expect(resolveCompanyNameSource("https://example.com/linkedin.com/search/results/people?company=Wrong")).toEqual({ kind: "wrongPage" });
    expect(resolveCompanyNameSource("https://example.com/?u=linkedin.com/search/results/people&company=Wrong")).toEqual({ kind: "wrongPage" });
    expect(resolveCompanyNameSource("https://notlinkedin.com/search/results/people/?company=Wrong")).toEqual({ kind: "wrongPage" });
    expect(resolveCompanyNameSource("https://linkedin.com.evil.test/search/results/people/?company=Wrong")).toEqual({ kind: "wrongPage" });
  });
});

describe("generateLinkedInURL", () => {
  it("output is unchanged for a sample input", () => {
    const url = generateLinkedInURL({
      companyName: "ServiceNow", companiesIds: "29352, 1035", titleOfProspect: "Engineering Manager",
      locationIds: "101620260", connectionDegree: ["F", "S"], startPage: 2,
    });
    expect(url).toBe(
      "https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH"
      + "&company=ServiceNow"
      + "&keywords=Engineering%20Manager%20ServiceNow"
      + "&currentCompany=%5B%2229352%22%2C%221035%22%5D"
      + "&geoUrn=%5B%22101620260%22%5D"
      + "&network=%5B%22F%22%2C%22S%22%5D"
      + "&page=2"
      + "&titleFreeText=Engineering%20Manager"
      + "&sid=BpI"
    );
  });
});

describe("attachClearButtons", () => {
  const render = (): void => {
    document.body.innerHTML = `
      <input id="a" type="text" value="hello">
      <textarea id="b">some text</textarea>
      <button id="clearA" type="button" data-clear-for="a">x</button>
      <button id="clearB" type="button" data-clear-for="b">x</button>
      <button id="clearMissing" type="button" data-clear-for="nope">x</button>
      <input id="careerField" type="text" value="keep">
      <button id="careerClear" type="button" class="career-clear" data-key="careerField">Clear</button>`;
    attachClearButtons(document);
  };

  it("empties an input and a textarea and fires a bubbling input event", () => {
    render();
    const seen: string[] = [];
    document.body.addEventListener("input", (e) => seen.push((e.target as HTMLElement).id));
    (document.getElementById("clearA") as HTMLButtonElement).click();
    (document.getElementById("clearB") as HTMLButtonElement).click();
    expect((document.getElementById("a") as HTMLInputElement).value).toBe("");
    expect((document.getElementById("b") as HTMLTextAreaElement).value).toBe("");
    expect(seen).toEqual(["a", "b"]);
  });

  it("ignores a button whose target id does not exist", () => {
    render();
    expect(() => (document.getElementById("clearMissing") as HTMLButtonElement).click()).not.toThrow();
  });

  it("does not bind .career-clear[data-key] buttons", () => {
    render();
    (document.getElementById("careerClear") as HTMLButtonElement).click();
    expect((document.getElementById("careerField") as HTMLInputElement).value).toBe("keep");
  });
});
