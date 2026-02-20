# openshelf-amazon-proxy

Lightweight local proxy to fetch Amazon search/product pages and return candidate cover image URLs.

Usage
- Run the proxy locally (see server/README). The app will query `http://localhost:4001/search?query=...`.
- The proxy returns a JSON array of objects: `{ url, title, source }`.

Notes
- This is intended for local use only. Amazon may block or throttle automated requests.
- For robust operation consider deploying a small server with caching and rate-limiting.
