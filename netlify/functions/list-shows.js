exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const { pageId, sectionId } = JSON.parse(event.body);

  const notionHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2026-03-11',
  };

  async function getChildren(blockId) {
    const r = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`, { headers: notionHeaders });
    const data = await r.json();
    return data.results || [];
  }

  const pageBlocks = [];
  let cursor;
  do {
    const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const r = await fetch(url, { headers: notionHeaders });
    const data = await r.json();
    pageBlocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  const headingTypes = ['heading_1', 'heading_2', 'heading_3'];
  const sectionStart = pageBlocks.findIndex(b => b.id === sectionId);
  if (sectionStart === -1) return { statusCode: 400, body: JSON.stringify({ error: 'Section not found' }) };

  const nextHeading = pageBlocks.findIndex((b, i) => i > sectionStart && headingTypes.includes(b.type));
  const sectionBlocks = pageBlocks.slice(sectionStart + 1, nextHeading === -1 ? undefined : nextHeading);

  const columnLists = sectionBlocks.filter(b => b.type === 'column_list');

  const shows = await Promise.all(columnLists.map(async (cl) => {
    try {
      const columns = await getChildren(cl.id);
      if (!columns.length) return null;

      const leftColumn = columns[0];
      const leftChildren = await getChildren(leftColumn.id);

      const titleBlock = leftChildren.find(b =>
        b.type === 'paragraph' &&
        b.paragraph.rich_text.some(t => t.annotations?.bold && t.text?.link?.url)
      );
      if (!titleBlock) return null;

      const richText = titleBlock.paragraph.rich_text[0];
      const title = richText.text.content;
      const url = richText.text.link?.url;
      const imdbMatch = url?.match(/tt\d+/);

      const caughtUpBlock = leftChildren.find(b => b.type === 'to_do' && b.to_do.checked);

      return {
        columnListId: cl.id,
        leftColumnId: leftColumn.id,
        title,
        url,
        imdbId: imdbMatch ? imdbMatch[0] : null,
        caughtUp: !!caughtUpBlock,
        caughtUpBlockId: caughtUpBlock?.id || null
      };
    } catch(e) {
      return null;
    }
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shows: shows.filter(Boolean) })
  };
};
