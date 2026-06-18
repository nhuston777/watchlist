# Watchlist Adder

Add movies and TV shows to your Notion watchlist by name — no IMDB lookup needed.

## Deploy to Vercel (recommended — 1 command)

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel --env NOTION_TOKEN=your_token_here`
3. Done! Vercel gives you a URL like `https://watchlist-xxx.vercel.app`

## Deploy to Netlify (drag and drop)

1. Go to [netlify.com](https://netlify.com) and sign up free
2. Go to **Sites → Add new site → Deploy manually**
3. Drag the `watchlist` folder into the drop zone
4. After deploy: go to **Site configuration → Environment variables**
5. Add `NOTION_TOKEN` = your token
6. Trigger a redeploy

## Environment variables

| Variable | Value |
|----------|-------|
| `NOTION_TOKEN` | Your Notion integration token (starts with `ntn_`) |

## Local development

```bash
npm install
NOTION_TOKEN=your_token node server.js
```
Then open http://localhost:3000
