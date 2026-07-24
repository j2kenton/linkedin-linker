export interface RenderSource { id:string; url:string; }

/** Only http(s) targets may ever render as a clickable link, regardless of where the URL came from. */
function isSafeLinkUrl(raw: string): boolean {
  try { const url = new URL(raw); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

function isTableSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

/** Tokenizes `**bold**`, `*italic*`, and `[S#]` citations (which stay resolvable even nested inside emphasis) into child nodes; everything else is inert text. */
function appendInline(element: HTMLElement, text: string, byId: Map<string, RenderSource>): void {
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[(S\d+)\]/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) element.append(document.createTextNode(text.slice(cursor, index)));
    if (match[1] !== undefined) {
      const strong = document.createElement("strong");
      appendInline(strong, match[1], byId);
      element.append(strong);
    } else if (match[2] !== undefined) {
      const em = document.createElement("em");
      appendInline(em, match[2], byId);
      element.append(em);
    } else {
      const id = match[3];
      const source = byId.get(id);
      if (source && isSafeLinkUrl(source.url)) {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `[${id}]`;
        element.append(link);
      } else {
        const plain = document.createElement("span");
        plain.textContent = match[0];
        plain.className = "unverified-reference";
        element.append(plain);
      }
    }
    cursor = index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(cursor)));
}

/** Small safe Markdown renderer: model HTML is always text, and links come only from stored source metadata. */
export function renderMarkdown(target: HTMLElement, markdown: string, sources: RenderSource[] = []): void {
  target.replaceChildren();
  const byId = new Map(sources.map(source => [source.id, source]));
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      appendInline(element, heading[2], byId);
      element.dataset.mdLine = String(i);
      target.append(element);
      i += 1;
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      const list = document.createElement("ul");
      while (i < lines.length) {
        const item = /^[-*]\s+(.+)$/.exec(lines[i]);
        if (!item) break;
        const li = document.createElement("li");
        appendInline(li, item[1], byId);
        li.dataset.mdLine = String(i);
        list.append(li);
        i += 1;
      }
      target.append(list);
      continue;
    }
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      const list = document.createElement("ol");
      while (i < lines.length) {
        const item = /^\d+\.\s+(.+)$/.exec(lines[i]);
        if (!item) break;
        const li = document.createElement("li");
        appendInline(li, item[1], byId);
        li.dataset.mdLine = String(i);
        list.append(li);
        i += 1;
      }
      target.append(list);
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      for (const cell of splitTableRow(line)) {
        const th = document.createElement("th");
        appendInline(th, cell, byId);
        headerRow.append(th);
      }
      headerRow.dataset.mdLine = String(i);
      thead.append(headerRow);
      table.append(thead);
      const tbody = document.createElement("tbody");
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const row = document.createElement("tr");
        for (const cell of splitTableRow(lines[i])) {
          const td = document.createElement("td");
          appendInline(td, cell, byId);
          row.append(td);
        }
        row.dataset.mdLine = String(i);
        tbody.append(row);
        i += 1;
      }
      table.append(tbody);
      target.append(table);
      continue;
    }
    const element = document.createElement(line ? "p" : "br");
    if (line) appendInline(element, line, byId);
    element.dataset.mdLine = String(i);
    target.append(element);
    i += 1;
  }
}
