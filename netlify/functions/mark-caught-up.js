exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const { leftColumnId, caughtUp, caughtUpBlockId } = JSON.parse(event.body);

  const notionHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2026-03-11',
  };

  if (caughtUp) {
    await fetch(`https://api.notion.com/v1/blocks/${leftColumnId}/children`, {
      method: 'PATCH',
      headers: notionHeaders,
      body: JSON.stringify({
        children: [{
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: '✅ Caught up' } }] }
        }]
      })
    });
  } else if (caughtUpBlockId) {
    await fetch(`https://api.notion.com/v1/blocks/${caughtUpBlockId}`, {
      method: 'DELETE',
      headers: notionHeaders
    });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
