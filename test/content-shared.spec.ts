// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectProspectCards, extractProspectFirstName, findConnectButton } from "../src/content-shared";

const render = (html: string): void => { document.body.innerHTML = html; };

describe("people-search prospect discovery", () => {
  it("finds cards in the classic list layout", () => {
    render(`<div class="search-results-container"><ul>
      <li><a href="https://www.linkedin.com/in/jane-doe/">Jane Doe</a><button aria-label="Invite Jane Doe to connect">Connect</button></li>
      <li><a href="https://www.linkedin.com/in/bob-roe/">Bob Roe</a><button aria-label="Message Bob Roe">Message</button></li>
    </ul></div>`);
    const cards = collectProspectCards();
    expect(cards).toHaveLength(1);
    expect(extractProspectFirstName(cards[0])).toBe("Jane");
  });

  it("finds cards in a class-less layout with invite links instead of buttons", () => {
    render(`<main><div>
      <div><div><a href="/in/jane-doe/">Jane Doe</a><p>Engineering Manager</p></div>
        <div><a aria-label="Invite Jane Doe to connect" href="/preload/search-custom-invite/?vanityName=jane-doe">Connect</a></div></div>
      <div><div><a href="/in/sam-poe/">Sam Poe</a></div>
        <div><a aria-label="Invite Sam Poe to connect" href="/preload/search-custom-invite/?vanityName=sam-poe">Connect</a></div></div>
    </div></main>`);
    const cards = collectProspectCards();
    expect(cards).toHaveLength(2);
    expect(cards.map(extractProspectFirstName)).toEqual(["Jane", "Sam"]);
    expect(cards[0].textContent).toContain("Engineering Manager");
    expect(cards[0].textContent).not.toContain("Sam Poe");
  });

  it("falls back to a visible Connect label when aria-labels are missing", () => {
    render(`<main><div><a href="/in/jane-doe/">Jane Doe</a><button><span>Connect</span></button></div></main>`);
    const cards = collectProspectCards();
    expect(cards).toHaveLength(1);
    expect(findConnectButton(cards[0])?.tagName).toBe("BUTTON");
    expect(extractProspectFirstName(cards[0])).toBe("Jane");
  });

  it("ignores pages without any Connect control", () => {
    render(`<main><a href="/mynetwork/">My Network</a><button aria-label="Follow Jane Doe">Follow</button></main>`);
    expect(collectProspectCards()).toEqual([]);
  });
});
