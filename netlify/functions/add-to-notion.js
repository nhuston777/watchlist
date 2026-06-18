exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };
  const { pageId, url, poster, plot, title } = JSON.parse(event.body);

  const bookmarkBlock = {
    object: 'block', type: 'bookmark',
    bookmark: { url, ...(plot ? { caption: [{ type: 'text', text: { content: plot.slice(0, 2000) } }] } : {}) }
  };

  const titleBlock = {
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: title || url, link: { url } }, annotations: { bold: true } }] }
  };

  const children = [];
  if (poster) {
    children.push({
      object: 'block', type: 'column_list',
      column_list: {
        children: [
          {
            object: 'block', type: 'column',
            column: { children: [titleBlock, ...(plot ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: plot.slice(0, 2000) } }] } }] : [])] }
          },
          {
            object: 'block', type: 'column',
            column: { children: [{ object: 'block', type: 'image', image: { type: 'external', external: { url: `https://images.weserv.nl/?url=${encodeURIComponent(poster)}&w=100` } } }] }
          }
        ]
      }
    });
  } else {
    children.push(titleBlock);
  }

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
