exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };
  const { pageId, url } = JSON.parse(event.body);
  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ children: [{ object: 'block', type: 'bookmark', bookmark: { url } }] })
  });
  const data = await r.json();
  if (!r.ok) return { statusCode: r.status, body: JSON.stringify({ error: data.message }) };
  return { statusCode: 200, body: JSON.stringify({ ok: true }), headers: { 'Content-Type': 'application/json' } };
};
