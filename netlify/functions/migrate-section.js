exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  const omdbKey = process.env.OMDB_KEY || 'trilogy';
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const { pageId, sectionId } = JSON.parse(event.body);

  const notionHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2026-03-11',
  };

  async function getPageBlocks(blockId) {
    const blocks = [];
    let cursor = undefined;
    do {
      const url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
      const r = await fetch(url, { headers: notionHeaders });
      const data = await r.json();
      blocks.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return blocks;
  }

  async function deleteBlock(blockId) {
    await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
      method: 'DELETE', headers: notionHeaders
    });
  }

  async function insertAfter(afterBlockId, children) {
    const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: notionHeaders,
      body: JSON.stringify({ children, position: { type: 'after_block', after_block: { id: afterBlockId } } })
    });
    const data = await r.json();
    return data.results;
  }

  function buildEntry(title, url, plot, poster) {
    const titleBlock = {
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: title || url, link: { url } }, annotations: { bold: true } }] }
    };
    if (!poster) return [titleBlock];
    return [{
      object: 'block', type: 'column_list',
      column_list: {
        children: [
          { object: 'block', type: 'column', column: { children: [titleBlock, ...(plot ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: plot.slice(0, 2000) } }] } }] : [])] } },
          { object: 'block', type: 'column', column: { children: [{ object: 'block', type: 'image', image: { type: 'external', external: { url: `https://images.weserv.nl/?url=${encodeURIComponent(poster)}&w=100` } } }] } }
        ]
      }
    }];
  }

  try {
    const allBlocks = await getPageBlocks(pageId);

    const headingTypes = ['heading_1', 'heading_2', 'heading_3'];
    const sectionStart = allBlocks.findIndex(b => b.id === sectionId);
    if (sectionStart === -1) return { statusCode: 400, body: JSON.stringify({ error: 'Section not found' }) };

    const nextHeading = allBlocks.findIndex((b, i) => i > sectionStart && headingTypes.includes(b.type));
    const sectionBlocks = allBlocks.slice(sectionStart + 1, nextHeading === -1 ? undefined : nextHeading);

    const bookmarks = sectionBlocks.filter(b => b.type === 'bookmark');
    const beforeUrls = bookmarks.map(b => b.bookmark.url);

    const results = [];
    let lastInsertedId = sectionId;

    for (const bookmark of bookmarks) {
      const url = bookmark.bookmark.url;
      const imdbMatch = url.match(/tt\d+/);
      if (!imdbMatch) {
        results.push({ url, status: 'skipped', reason: 'not an IMDB link' });
        lastInsertedId = bookmark.id;
        continue;
      }

      const imdbId = imdbMatch[0];
      let title, plot, poster;
      try {
        const omdbRes = await fetch(`https://www.omdbapi.com/?apikey=${omdbKey}&i=${imdbId}&plot=short`);
        const omdbData = await omdbRes.json();
        if (omdbData.Response === 'True') {
          title = omdbData.Title;
          plot = omdbData.Plot !== 'N/A' ? omdbData.Plot : null;
          poster = omdbData.Poster !== 'N/A' ? omdbData.Poster : null;
        }
      } catch(e) {}

      await deleteBlock(bookmark.id);
      const inserted = await insertAfter(lastInsertedId, buildEntry(title, url, plot, poster));
      lastInsertedId = inserted[inserted.length - 1].id;
      results.push({ url, title: title || url, status: 'converted' });
    }

    const afterBlocks = await getPageBlocks(pageId);
    const afterSectionStart = afterBlocks.findIndex(b => b.id === sectionId);
    const afterNextHeading = afterBlocks.findIndex((b, i) => i > afterSectionStart && headingTypes.includes(b.type));
    const afterSection = afterBlocks.slice(afterSectionStart + 1, afterNextHeading === -1 ? undefined : afterNextHeading);

    const afterUrls = new Set(
      afterSection
        .flatMap(b => {
          if (b.type === 'paragraph') return b.paragraph.rich_text.flatMap(t => t.href ? [t.href] : []);
          if (b.type === 'column_list') return [];
          return [];
        })
    );

    const missing = beforeUrls.filter(u => !afterUrls.has(u));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results, beforeCount: beforeUrls.length, afterCount: results.filter(r => r.status === 'converted').length, missing })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
