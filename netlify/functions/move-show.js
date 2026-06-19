exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const { pageId, columnListId, targetSectionId } = JSON.parse(event.body);

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

  // Reconstruct the column_list block from existing content
  const columns = await getChildren(columnListId);
  if (columns.length < 2) return { statusCode: 400, body: JSON.stringify({ error: 'Could not read show columns' }) };

  const leftChildren = await getChildren(columns[0].id);
  const rightChildren = await getChildren(columns[1].id);

  // Build left column blocks (exclude caught up marker — fresh start in watched)
  const leftBlocks = leftChildren
    .filter(b => {
      if (b.type === 'to_do') return false;
      if (b.type === 'paragraph' && b.paragraph.rich_text.some(t => t.text?.content?.includes('Caught up'))) return false;
      return true;
    })
    .map(b => {
      if (b.type === 'paragraph') {
        return { object: 'block', type: 'paragraph', paragraph: { rich_text: b.paragraph.rich_text } };
      }
      return null;
    })
    .filter(Boolean);

  // Build right column blocks (image)
  const rightBlocks = rightChildren
    .filter(b => b.type === 'image' && b.image?.external?.url)
    .map(b => ({
      object: 'block', type: 'image',
      image: { type: 'external', external: { url: b.image.external.url } }
    }));

  const newColumnList = {
    object: 'block', type: 'column_list',
    column_list: {
      children: [
        { object: 'block', type: 'column', column: { children: leftBlocks } },
        { object: 'block', type: 'column', column: { children: rightBlocks } }
      ]
    }
  };

  // Delete old block
  await fetch(`https://api.notion.com/v1/blocks/${columnListId}`, {
    method: 'DELETE', headers: notionHeaders
  });

  // Insert at target section
  await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH', headers: notionHeaders,
    body: JSON.stringify({
      children: [newColumnList],
      position: { type: 'after_block', after_block: { id: targetSectionId } }
    })
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
