export type PopupTab = "career" | "connect";
const STORAGE_KEY = "popupActiveTab";

/**
 * Wires the shared two-tab popup shell (Career first/default, Connect
 * second) used by both the dev and store builds. Persists the last-used tab
 * so the popup restores it on reopen.
 */
export function initPopupTabs(): void {
  document.addEventListener("DOMContentLoaded", () => {
    const tabCareer = document.getElementById("tabCareer") as HTMLButtonElement | null;
    const tabConnect = document.getElementById("tabConnect") as HTMLButtonElement | null;
    const panelCareer = document.getElementById("panelCareer") as HTMLElement | null;
    const panelConnect = document.getElementById("panelConnect") as HTMLElement | null;
    if (!tabCareer || !tabConnect || !panelCareer || !panelConnect) return;

    const show = (tab: PopupTab): void => {
      const isCareer = tab === "career";
      tabCareer.setAttribute("aria-selected", String(isCareer));
      tabConnect.setAttribute("aria-selected", String(!isCareer));
      tabCareer.tabIndex = isCareer ? 0 : -1;
      tabConnect.tabIndex = isCareer ? -1 : 0;
      panelCareer.hidden = !isCareer;
      panelConnect.hidden = isCareer;
    };

    const select = (tab: PopupTab): void => {
      show(tab);
      chrome.storage.local.set({ [STORAGE_KEY]: tab });
    };

    tabCareer.addEventListener("click", () => select("career"));
    tabConnect.addEventListener("click", () => select("connect"));

    chrome.storage.local.get([STORAGE_KEY], (result: Record<string, unknown>) => {
      show(result[STORAGE_KEY] === "connect" ? "connect" : "career");
    });
  });
}
