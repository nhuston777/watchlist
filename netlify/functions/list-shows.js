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

  async function convertToDoParagraph(leftColumnId, toDoBlockId) {
    await fetch(`https://api.notion.com/v1/blocks/${toDoBlockId}`, { method: 'DELETE', headers: notionHeaders });
    const r = await fetch(`https://api.notion.com/v1/blocks/${leftColumnId}/children`, {
      method: 'PATCH', headers: notionHeaders,
      body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '✅ Caught up' } }] } }] })
    });
    const data = await r.json();
    return data.results?.[0]?.id || null;
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
  let sectionBlocks;
  if (sectionId) {
    const sectionStart = pageBlocks.findIndex(b => b.id === sectionId);
    if (sectionStart === -1) return { statusCode: 400, body: JSON.stringify({ error: 'Section not found' }) };
    const nextHeading = pageBlocks.findIndex((b, i) => i > sectionStart && headingTypes.includes(b.type));
    sectionBlocks = pageBlocks.slice(sectionStart + 1, nextHeading === -1 ? undefined : nextHeading);
  } else {
    sectionBlocks = pageBlocks.filter(b => !headingTypes.includes(b.type));
  }

  const shows = await Promise.all(sectionBlocks.map(async (block) => {
    try {
      if (block.type === 'column_list') {
        const columns = await getChildren(block.id);
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

        let caughtUpBlock = leftChildren.find(b =>
          b.type === 'paragraph' &&
          b.paragraph.rich_text.some(t => t.text?.content?.includes('Caught up'))
        );
        let caughtUpBlockId = caughtUpBlock?.id || null;

        const legacyToDoBlock = leftChildren.find(b => b.type === 'to_do' && b.to_do.checked);
        if (legacyToDoBlock) {
          caughtUpBlockId = await convertToDoParagraph(leftColumn.id, legacyToDoBlock.id);
        }

        return {
          columnListId: block.id,
          leftColumnId: leftColumn.id,
          title, url,
          imdbId: imdbMatch ? imdbMatch[0] : null,
          caughtUp: !!(caughtUpBlock || legacyToDoBlock),
          caughtUpBlockId
        };
      }

      if (block.type === 'paragraph') {
        const rt = block.paragraph.rich_text;
        const boldLink = rt.find(t => t.annotations?.bold && t.text?.link?.url);
        if (!boldLink) return null;
        const title = boldLink.text.content;
        const url = boldLink.text.link.url;
        const imdbMatch = url?.match(/tt\d+/);
        return {
          columnListId: block.id,
          leftColumnId: null,
          title, url,
          imdbId: imdbMatch ? imdbMatch[0] : null,
          caughtUp: false,
          caughtUpBlockId: null
        };
      }

      return null;
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
