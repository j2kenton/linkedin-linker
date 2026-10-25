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
