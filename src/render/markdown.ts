export interface RenderSource { id:string; url:string; }

/** Only http(s) targets may ever render as a clickable link, regardless of where the URL came from. */
function isSafeLinkUrl(raw: string): boolean {
  try { const url = new URL(raw); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

/** Small safe Markdown renderer: model HTML is always text, and links come only from stored source metadata. */
export function renderMarkdown(target: HTMLElement, markdown: string, sources: RenderSource[] = []): void {
  target.replaceChildren(); const byId=new Map(sources.map(source=>[source.id,source]));
  for (const line of markdown.split(/\r?\n/)) {
    const heading=/^(#{1,3})\s+(.+)$/.exec(line); const element=heading ? document.createElement(`h${heading[1].length}`) : document.createElement(line ? "p" : "br");
    const text=heading ? heading[2] : line; let cursor=0;
    for (const marker of text.matchAll(/\[(S\d+)\]/g)) { element.append(document.createTextNode(text.slice(cursor,marker.index))); const source=byId.get(marker[1]); if (source && isSafeLinkUrl(source.url)) { const link=document.createElement("a"); link.href=source.url; link.target="_blank"; link.rel="noopener noreferrer"; link.textContent=`[${marker[1]}]`; element.append(link); } else { const plain=document.createElement("span"); plain.textContent=marker[0]; plain.className="unverified-reference"; element.append(plain); } cursor=(marker.index || 0)+marker[0].length; }
    element.append(document.createTextNode(text.slice(cursor))); target.append(element);
  }
}
