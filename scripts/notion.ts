// Reads the v1 Notion watchlist pages and turns them into entries, loose notes and bookmarks.
// Parsing follows v1's netlify/functions/list-shows.js, plus the loose shapes found on the real pages.

import type { ListKey, StatusKey } from "../src/lib/types";

const NOTION_VERSION = "2022-06-28";
const MIN_INTERVAL_MS = 350; // Notion allows ~3 requests/second

export interface PageConfig {
  key: "movies" | "fam" | "tv";
  name: string;
  id: string;
  /** List/status for blocks above the first heading. */
  top: [ListKey, StatusKey];
  /** Heading text (lowercased) → list/status. */
  sections: Record<string, [ListKey, StatusKey]>;
}

export const PAGES: PageConfig[] = [
  {
    key: "movies",
    name: "Movie List",
    id: "9599f1fb-5a4f-4dd4-b060-5a090e004a61",
    top: ["ME", "WANT"],
    sections: { "want to watch": ["ME", "WANT"], "have watched": ["ME", "WATCHED"] },
  },
  {
    key: "fam",
    name: "Movies for the Fam",
    id: "098e01dc6edf442385758f06a252baab",
    top: ["FAM", "WANT"],
    sections: { "have watched": ["FAM", "WATCHED"] },
  },
  {
    key: "tv",
    name: "TV Shows",
    id: "881ebd59-d776-44a9-a563-02d6ff006e00",
    top: ["ME", "WANT"],
    sections: { me: ["ME", "WANT"], "dot & me": ["DOT_AND_ME", "WANT"], fam: ["FAM", "WANT"], watched: ["ME", "WATCHED"] },
  },
];

interface Placement {
  page: PageConfig;
  section: string; // heading text, or "top"
  list: ListKey;
  status: StatusKey;
  /** e.g. "notion:tv:Dot & Me" */
  source: string;
}

export interface TitleEntry extends Placement {
  title: string;
  imdbId: string | null;
  caughtUp: boolean;
  createdTime: string;
}

export interface LooseNote extends Placement {
  text: string;
}

export interface Bookmark extends Placement {
  url: string;
  imdbId: string | null;
}

export interface ParsedPages {
  entries: TitleEntry[];
  notes: LooseNote[];
  bookmarks: Bookmark[];
  skipped: Record<string, number>;
  warnings: string[];
}

interface RichText {
  plain_text: string;
  href?: string | null;
  annotations?: { bold?: boolean };
  text?: { content: string; link?: { url: string } | null };
}

interface Block {
  id: string;
  type: string;
  created_time: string;
  has_children?: boolean;
  [key: string]: unknown;
}

function richText(b: Block): RichText[] {
  const v = b[b.type] as { rich_text?: RichText[] } | undefined;
  return v?.rich_text ?? [];
}

const linkOf = (t: RichText) => t.text?.link?.url ?? t.href ?? null;

export function imdbIdFrom(url: string | null | undefined): string | null {
  return url?.match(/tt\d{6,}/)?.[0] ?? null;
}

/** A bold, linked title in a paragraph (the entry shape v1 writes), or null. */
function linkedTitle(b: Block): { title: string; url: string } | null {
  if (b.type !== "paragraph") return null;
  const parts = richText(b).filter((t) => t.annotations?.bold && linkOf(t));
  if (!parts.length) return null;
  return { title: parts.map((t) => t.plain_text).join("").trim(), url: linkOf(parts[0])! };
}

export class NotionClient {
  private last = 0;
  requests = 0;

  constructor(private token: string) {}

  private async get<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      this.requests++;
      const res = await fetch(`https://api.notion.com/v1${path}`, {
        headers: { Authorization: `Bearer ${this.token}`, "Notion-Version": NOTION_VERSION },
      });
      if (res.ok) return res.json() as Promise<T>;
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new Error(`Notion ${path} failed: ${res.status} ${await res.text()}`);
    }
  }

  async children(blockId: string): Promise<Block[]> {
    const out: Block[] = [];
    let cursor: string | undefined;
    do {
      const data = await this.get<{ results: Block[]; has_more: boolean; next_cursor: string | null }>(
        `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
      );
      out.push(...data.results);
      cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return out;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Walks one page top to bottom, tracking the current heading. */
async function parsePage(client: NotionClient, page: PageConfig, out: ParsedPages): Promise<void> {
  const blocks = await client.children(page.id);
  let place: Placement = { page, section: "top", list: page.top[0], status: page.top[1], source: `notion:${page.key}:top` };
  // Loose titles (a bold linked paragraph) are often followed by a poster image and a plain-text
  // synopsis; that synopsis isn't a loose note.
  let afterLooseTitle = false;
  const skip = (type: string) => (out.skipped[type] = (out.skipped[type] ?? 0) + 1);

  for (const b of blocks) {
    if (b.type.startsWith("heading_")) {
      const text = richText(b).map((t) => t.plain_text).join("").trim();
      const mapped = page.sections[text.toLowerCase()];
      if (!mapped) out.warnings.push(`${page.name}: unknown heading "${text}", using ${page.top.join(" · ")}`);
      const [list, status] = mapped ?? page.top;
      place = { page, section: text, list, status, source: `notion:${page.key}:${text}` };
      afterLooseTitle = false;
      continue;
    }

    if (b.type === "column_list") {
      afterLooseTitle = false;
      const columns = await client.children(b.id);
      const left = columns[0] ? await client.children(columns[0].id) : [];
      const titleBlock = left.map(linkedTitle).find(Boolean);
      if (!titleBlock) {
        skip("column_list without a linked title");
        continue;
      }
      const caughtUp = left.some(
        (c) =>
          (c.type === "paragraph" && richText(c).some((t) => t.plain_text.includes("Caught up"))) ||
          (c.type === "to_do" && (c.to_do as { checked?: boolean }).checked),
      );
      out.entries.push({ ...place, title: titleBlock.title, imdbId: imdbIdFrom(titleBlock.url), caughtUp, createdTime: b.created_time });
      continue;
    }

    if (b.type === "paragraph") {
      const loose = linkedTitle(b);
      if (loose) {
        out.entries.push({ ...place, title: loose.title, imdbId: imdbIdFrom(loose.url), caughtUp: false, createdTime: b.created_time });
        afterLooseTitle = true;
        continue;
      }
      const text = richText(b).map((t) => t.plain_text).join("").trim();
      if (!text) {
        skip("empty paragraph");
        continue;
      }
      if (afterLooseTitle) {
        skip("synopsis under a loose title");
        afterLooseTitle = false;
        continue;
      }
      out.notes.push({ ...place, text });
      continue;
    }

    if (b.type === "image" && afterLooseTitle) {
      skip("image");
      continue; // keep afterLooseTitle for the synopsis that follows
    }
    afterLooseTitle = false;

    if (b.type === "bookmark") {
      const url = (b.bookmark as { url?: string }).url ?? "";
      const imdbId = imdbIdFrom(url);
      if (imdbId) out.bookmarks.push({ ...place, url, imdbId });
      else skip("bookmark (not IMDb)");
      continue;
    }

    skip(b.type); // child_page, divider, image, unsupported (buttons), ...
  }
}

export async function readNotion(token: string): Promise<ParsedPages & { requests: number }> {
  const client = new NotionClient(token);
  const out: ParsedPages = { entries: [], notes: [], bookmarks: [], skipped: {}, warnings: [] };
  for (const page of PAGES) {
    process.stderr.write(`Reading ${page.name}…\n`);
    await parsePage(client, page, out);
  }
  return { ...out, requests: client.requests };
}

/** "Dunkirk, 1917, Lone Survivor" → ["Dunkirk", "1917", "Lone Survivor"] */
export function splitNote(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
