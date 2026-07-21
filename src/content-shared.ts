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

export const findConnectButton = (container: Element): HTMLElement | null => {
  const button = container.querySelector("button[aria-label$='connect']");
  if (button) return button as HTMLElement;
  const anchor = container.querySelector(
    "a[href*='search-custom-invite'], a[aria-label*='connect' i], a[aria-label*='Connect' i]"
  );
  if (anchor) return anchor as HTMLElement;
  return null;
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
