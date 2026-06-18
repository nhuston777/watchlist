const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = '2026-03-11';

app.post('/api/search', async (req, res) => {
  const { query, type } = req.body;
  const omdbType = type === 'tv' ? 'series' : 'movie';
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${process.env.OMDB_KEY || 'trilogy'}&s=${encodeURIComponent(query)}&type=${omdbType}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/detail', async (req, res) => {
  const { imdbId } = req.body;
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${process.env.OMDB_KEY || 'trilogy'}&i=${imdbId}&plot=short`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/add-to-notion', async (req, res) => {
  const { pageId, url, poster, plot } = req.body;
  if (!NOTION_TOKEN) return res.status(500).json({ error: 'NOTION_TOKEN not set' });
  try {
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
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({ children, position: { type: 'start' } })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Notion error' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Watchlist server running on port ${PORT}`));
