exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };
  const { pageId, url, poster, plot } = JSON.parse(event.body);

  const children = [];
  if (poster) {
    children.push({ object: 'block', type: 'image', image: { type: 'external', external: { url: poster } } });
  }
  const bookmark = { url };
  if (plot) bookmark.caption = [{ type: 'text', text: { content: plot.slice(0, 2000) } }];
  children.push({ object: 'block', type: 'bookmark', bookmark });

  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2026-03-11',
    },
    body: JSON.stringify({ children, position: { type: 'start' } })
  });
  const data = await r.json();
  if (!r.ok) return { statusCode: r.status, body: JSON.stringify({ error: data.message }) };
  return { statusCode: 200, body: JSON.stringify({ ok: true }), headers: { 'Content-Type': 'application/json' } };
};
