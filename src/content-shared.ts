export interface MessageSettings {
  greetingPart1: string;
  includeFirstName: boolean;
  greetingPart2: string;
  messageText: string;
}

export const buildNote = (firstName: string, messageSettings: MessageSettings): string => {
  const { greetingPart1, includeFirstName, greetingPart2, messageText } = messageSettings;
  let message = greetingPart1;
  if (includeFirstName && firstName) {
    message += ` ${firstName}`;
  }
  message += ` ${greetingPart2}\n${messageText}`;
  return message;
};

// Advisory limits taken from the owner's report of LinkedIn's connection-note box
// (about 200 characters, about 300 with Premium). They are NOT verified against
// LinkedIn and must only ever be used to inform the user, never to block or cut a note.
export const NOTE_LIMIT_FREE = 200;
export const NOTE_LIMIT_PREMIUM = 300;

export interface NoteMeasure {
  /** Characters in the note excluding the first name itself (includes the separating space when a name is added). */
  fixed: number;
  /** Whether a first name will be inserted at send time. */
  includesName: boolean;
}

export const measureNote = (messageSettings: MessageSettings): NoteMeasure => {
  const includesName = messageSettings.includeFirstName;
  return { fixed: buildNote("", messageSettings).length + (includesName ? 1 : 0), includesName };
};

export type NoteLengthLevel = "ok" | "warn" | "over";

export interface NoteLengthAssessment {
  level: NoteLengthLevel;
  message: string;
}

export const assessNoteLength = (fixed: number, includesName: boolean): NoteLengthAssessment => {
  // With a name the shortest possible note is one character longer than `fixed`.
  const shortest = includesName ? fixed + 1 : fixed;
  const level: NoteLengthLevel = shortest > NOTE_LIMIT_PREMIUM ? "over" : shortest > NOTE_LIMIT_FREE ? "warn" : "ok";
  const nameRoom = (limit: number): number => Math.max(0, limit - fixed);
  const counted = includesName ? `${fixed} characters plus the first name` : `${fixed} characters`;
  if (level === "over") {
    return {
      level,
      message: `${counted}. Over the approximate ${NOTE_LIMIT_PREMIUM}-character Premium limit; LinkedIn may reject or cut the note. Limits are approximate and not enforced here.`,
    };
  }
  if (level === "warn") {
    return {
      level,
      message: includesName
        ? `${counted}. Over the approximate ${NOTE_LIMIT_FREE}-character limit without Premium; fits the approximate ${NOTE_LIMIT_PREMIUM}-character Premium limit for first names up to ${nameRoom(NOTE_LIMIT_PREMIUM)} characters.`
        : `${counted}. Over the approximate ${NOTE_LIMIT_FREE}-character limit without Premium; within the approximate ${NOTE_LIMIT_PREMIUM}-character Premium limit.`,
    };
  }
  return {
    level,
    message: includesName
      ? `${counted}. Fits the approximate ${NOTE_LIMIT_FREE}-character limit for first names up to ${nameRoom(NOTE_LIMIT_FREE)} characters (up to ${nameRoom(NOTE_LIMIT_PREMIUM)} with Premium's approximate ${NOTE_LIMIT_PREMIUM}).`
      : `${counted}. Within the approximate ${NOTE_LIMIT_FREE}-character limit.`,
  };
};

export const generateRandomTimeout = (multiplier: number): number =>
  Math.floor(Math.random() * multiplier) + 500;

export const extractFirstName = (prospectText: string): string => {
  if (!prospectText) return "";
  const match = prospectText.match(/[\p{L}\p{N}]+/u);
  if (match) {
    const name = match[0];
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return "";
};

const CONNECT_CONTROL_SELECTOR =
  "button[aria-label$='connect' i], a[href*='search-custom-invite'], a[aria-label*='to connect' i]";

// Fallback for layouts that drop the aria-label: a button/link whose visible text is just "Connect".
const isTextConnectControl = (el: Element): boolean =>
  (el.textContent ?? "").trim().toLowerCase() === "connect";

const findConnectControls = (root: ParentNode): HTMLElement[] => {
  const labelled = [...root.querySelectorAll<HTMLElement>(CONNECT_CONTROL_SELECTOR)];
  if (labelled.length > 0) return labelled;
  return [...root.querySelectorAll<HTMLElement>("button, a, [role='button']")].filter(isTextConnectControl);
};

export const findConnectButton = (container: Element): HTMLElement | null =>
  findConnectControls(container)[0] ?? null;

const profileSlug = (href: string): string | null => href.match(/\/in\/([^/?#]+)/)?.[1] ?? null;

const distinctProfileCount = (el: Element): number => {
  const slugs = new Set<string>();
  for (const a of el.querySelectorAll<HTMLAnchorElement>("a[href*='/in/']")) {
    const slug = profileSlug(a.href);
    if (slug) slugs.add(slug);
  }
  return slugs.size;
};

// Resolve the result card that owns a Connect control. LinkedIn renames its card
// classes often, so after the known list markup we fall back to the largest
// ancestor that still links to exactly one person.
const findProspectCard = (control: Element): Element => {
  const semantic = control.closest("li, [role='listitem'], [data-view-name*='search-entity-result'], .entity-result__item");
  if (semantic) return semantic;
  let card: Element | null = null;
  for (let el = control.parentElement; el && el !== document.body; el = el.parentElement) {
    const count = distinctProfileCount(el);
    if (count > 1) break;
    if (count === 1) card = el;
  }
  return card ?? control.parentElement ?? control;
};

// Every connectable person card on the page, in document order, one entry per card.
export const collectProspectCards = (root: ParentNode = document): Element[] => {
  const cards: Element[] = [];
  for (const control of findConnectControls(root)) {
    const card = findProspectCard(control);
    if (!cards.includes(card)) cards.push(card);
  }
  return cards;
};

// Prefer the name in "Invite Jane Doe to connect"; card text can lead with badges or status.
export const extractProspectFirstName = (card: Element): string => {
  const label = findConnectButton(card)?.getAttribute("aria-label") ?? "";
  const invited = label.match(/invite\s+(.+?)\s+to connect/i);
  return extractFirstName(invited ? invited[1] : (card as HTMLElement).innerText ?? card.textContent ?? "");
};

export const findModal = (): HTMLElement | null => {
  let modal = document.querySelector("div[role='dialog'].send-invite") as HTMLElement | null;
  if (modal) return modal;
  const shadowHost = document.querySelector("#interop-outlet");
  if (shadowHost && shadowHost.shadowRoot) {
    modal = shadowHost.shadowRoot.querySelector("div[role='dialog'].send-invite") as HTMLElement | null;
  }
  return modal;
};
