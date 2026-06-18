exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };
  const { pageId } = JSON.parse(event.body);

  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2026-03-11',
    }
  });
  const data = await r.json();
  if (!r.ok) return { statusCode: r.status, body: JSON.stringify({ error: data.message }) };

  const headingTypes = ['heading_1', 'heading_2', 'heading_3'];
  const sections = data.results
    .filter(b => headingTypes.includes(b.type))
    .map(b => ({
      id: b.id,
      name: b[b.type].rich_text.map(t => t.plain_text).join('') || '(untitled)'
    }));

  return { statusCode: 200, body: JSON.stringify({ sections }), headers: { 'Content-Type': 'application/json' } };
};
