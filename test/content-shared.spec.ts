// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  assessNoteLength, buildNote, collectProspectCards, extractProspectFirstName, findConnectButton,
  measureNote, NOTE_LIMIT_FREE, NOTE_LIMIT_PREMIUM, type MessageSettings,
} from "../src/content-shared";

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

describe("advisory note length", () => {
  const settings = (length: number, includeFirstName: boolean): MessageSettings => ({
    greetingPart1: "", includeFirstName, greetingPart2: "", messageText: "x".repeat(length),
  });
  // Without a name the note is " " + "\n" + text (2 extra characters); a name adds one more for its separating space.
  const withoutName = (total: number) => measureNote(settings(total - 2, false));
  const withName = (fixed: number) => measureNote(settings(fixed - 3, true));

  it("measures the fixed length with and without a first name", () => {
    expect(withoutName(199)).toEqual({ fixed: 199, includesName: false });
    expect(withName(199)).toEqual({ fixed: 199, includesName: true });
    expect(buildNote("Jane", settings(10, true)).length).toBe(withName(13).fixed + "Jane".length);
  });

  it("without a first name: ok up to 200, warn up to 300, over above", () => {
    const levels = [199, 200, 201, 300, 301].map(n => assessNoteLength(withoutName(n).fixed, false).level);
    expect(levels).toEqual(["ok", "ok", "warn", "warn", "over"]);
  });

  it("with a first name the shortest possible name is counted", () => {
    const levels = [199, 200, 201, 300, 301].map(n => assessNoteLength(withName(n).fixed, true).level);
    expect(levels).toEqual(["ok", "warn", "warn", "over", "over"]);
  });

  it("describes the limits as approximate and states the name allowance", () => {
    expect(assessNoteLength(150, true).message).toContain("approximate");
    expect(assessNoteLength(150, true).message).toContain("up to 50 characters");
    expect(assessNoteLength(250, true).message).toContain("up to 50 characters");
    expect(assessNoteLength(301, false).message).toContain("LinkedIn may reject or cut the note");
    expect(assessNoteLength(NOTE_LIMIT_FREE, false).message).toContain("200-character");
    expect(NOTE_LIMIT_PREMIUM).toBe(300);
  });
});
