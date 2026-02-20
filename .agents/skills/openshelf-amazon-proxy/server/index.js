const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 4001;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Simple search endpoint: /search?query=...
app.get('/search', async (req, res) => {
  const q = (req.query.query || '').toString();
  if (!q) return res.json([]);

  try {
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
    const resp = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await resp.text();
    const $ = cheerio.load(text);

    const results = [];

    $('img.s-image').each((i, el) => {
      const url = $(el).attr('src') || $(el).attr('data-src');
      if (url) {
        results.push({ url, title: $(el).attr('alt') || null, source: 'Amazon search' });
      }
    });

    // If no results from search, try extracting og:image from the page
    if (results.length === 0) {
      const og = $('meta[property="og:image"]').attr('content');
      if (og) results.push({ url: og, title: null, source: 'Amazon og:image' });
    }

    // Ensure unique
    const unique = [];
    const seen = new Set();
    for (const r of results) {
      if (!seen.has(r.url)) {
        seen.add(r.url);
        unique.push(r);
      }
    }

    res.json(unique.slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Image proxy endpoint to avoid CORS issues in the browser.
// Usage: /image?url=<encoded image url>
app.get('/image', async (req, res) => {
  const target = (req.query.url || '').toString();
  if (!target) return res.status(400).send('missing url');

  try {
    const resp = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // allow browser to fetch this resource from a different origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buffer = await resp.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err) {
    return res.status(502).json({ error: String(err) });
  }
});

app.listen(PORT, () => console.log(`openshelf-amazon-proxy listening on ${PORT}`));
