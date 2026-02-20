import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import ePub from "epubjs";
import "./App.css";

type Metadata = {
  title?: string;
  creator?: string;
};

type RenditionLike = {
  display: (target?: string) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  destroy: () => void;
  resize: (width: number, height: number) => void;
  spread: (mode: "none" | "auto") => void;
  themes?: {
    fontSize: (size: string) => void;
    default: (styles: Record<string, Record<string, string>>) => void;
  };
};

type BookLike = {
  ready: Promise<unknown>;
  loaded: {
    metadata: Promise<Metadata>;
  };
  renderTo: (
    element: HTMLElement,
    options: { width?: string | number; height?: string | number; spread?: string },
  ) => RenditionLike;
  destroy: () => void;
};

function App() {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bookRef = useRef<BookLike | null>(null);
  const renditionRef = useRef<RenditionLike | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [title, setTitle] = useState<string>("No book loaded");
  const [error, setError] = useState<string>("");
  const [hasBook, setHasBook] = useState(false);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [coverCandidates, setCoverCandidates] = useState<
    { url: string; source: string; title?: string; id?: string; original?: string }[]
  >([]);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
  const [coverPanelOpen, setCoverPanelOpen] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverLoadingMessage, setCoverLoadingMessage] = useState<string | null>(null);
  const [manualCoverUrl, setManualCoverUrl] = useState<string>("");
  const [viewMode, setViewMode] = useState<"single" | "double">("single");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [fontScale, setFontScale] = useState(100);
  const [letterSpacing, setLetterSpacing] = useState(0);

  const applyReaderStyles = useCallback(
    (rendition: RenditionLike) => {
      if (!rendition.themes) {
        return;
      }

      rendition.themes.fontSize(`${fontScale}%`);
      rendition.themes.default({
        body: {
          "background-color": isDarkMode ? "#111827" : "#ffffff",
          color: isDarkMode ? "#f9fafb" : "#111827",
          margin: "0",
          "line-height": "1.6",
          "letter-spacing": `${letterSpacing}em`,
        },
        a: {
          color: isDarkMode ? "#93c5fd" : "#1d4ed8",
        },
      });
    },
    [fontScale, isDarkMode, letterSpacing],
  );

  const destroyBook = () => {
    renditionRef.current?.destroy();
    bookRef.current?.destroy();
    renditionRef.current = null;
    bookRef.current = null;
    setHasBook(false);

    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      destroyBook();
    };
  }, []);

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".epub")) {
      setError("Please select a valid .epub file.");
      return;
    }

    setError("");
    setFileName(file.name);
    setTitle("Loading...");

    destroyBook();

    try {
      if (!viewerRef.current) {
        setError("Viewer is not ready yet. Please try again.");
        setTitle("No book loaded");
        return;
      }

      const fileBufferLocal = await file.arrayBuffer();
      setFileBuffer(fileBufferLocal);
      const fileBuffer = fileBufferLocal;
      const book = ePub(fileBuffer) as unknown as BookLike;
      bookRef.current = book;

      await book.ready;

      const metadata = await book.loaded.metadata;
      setTitle(metadata.title || file.name);

      const container = viewerRef.current!;
      const rendition = book.renderTo(container, {
        width: container.offsetWidth,
        height: container.offsetHeight,
        spread: viewMode === "double" ? "auto" : "none",
      });

      renditionRef.current = rendition;
      applyReaderStyles(rendition);
      await rendition.display();
      setHasBook(true);
    } catch {
      destroyBook();
      setError("Could not open this EPUB file. Try another EPUB or reload the page.");
      setTitle("No book loaded");
    }
  };

  const goPrevious = async () => {
    if (renditionRef.current) {
      await renditionRef.current.prev();
    }
  };

  const goNext = async () => {
    if (renditionRef.current) {
      await renditionRef.current.next();
    }
  };

  const toggleViewMode = () => {
    setViewMode((prev) => (prev === "single" ? "double" : "single"));
  };

  useEffect(() => {
    if (renditionRef.current && bookRef.current && viewerRef.current) {
      const container = viewerRef.current;
      renditionRef.current.spread(viewMode === "double" ? "auto" : "none");
      renditionRef.current.resize(container.offsetWidth, container.offsetHeight);
    }
  }, [viewMode]);

  useEffect(() => {
    const onResize = () => {
      if (renditionRef.current && viewerRef.current) {
        const container = viewerRef.current;
        renditionRef.current.resize(container.offsetWidth, container.offsetHeight);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (renditionRef.current) {
      applyReaderStyles(renditionRef.current);
    }
  }, [applyReaderStyles]);

  useEffect(() => {
    // Apply theme globally by toggling a class on the root element
    try {
      if (isDarkMode) {
        document.documentElement.classList.add("theme-dark");
      } else {
        document.documentElement.classList.remove("theme-dark");
      }
    } catch {
      /* ignore in non-browser environments */
    }
  }, [isDarkMode]);

  const queryCoverCandidates = async () => {
    setCoverLoading(true);
    setCoverLoadingMessage("Searching for cover candidates...");
    // Use title/author from metadata if available
    const meta = await bookRef.current?.loaded.metadata.catch(() => ({} as Metadata));
    const qParts: string[] = [];
    if (meta?.title) qParts.push(`intitle:${meta.title}`);
    const searchTitle = meta?.title || title || fileName || "";

    const authors = (meta && (meta as Metadata).creator) || "";

    const candidates: { url: string; source: string; title?: string; id?: string }[] = [];

    // Google Books search - prefer largest available image
    try {
      const gbQuery = encodeURIComponent(`${searchTitle} ${authors}`.trim());
      const gbResp = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${gbQuery}&maxResults=10`,
      );
      const gbJson = await gbResp.json();
      if (gbJson.items) {
        for (const item of gbJson.items) {
          const info = item.volumeInfo || {};
          if (info.imageLinks) {
            const links = info.imageLinks;
            const best = links.extraLarge || links.large || links.medium || links.small || links.thumbnail;
            if (best) {
              candidates.push({ url: best, source: "Google Books", title: info.title, id: item.id });
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // Open Library search
    try {
      const olQuery = encodeURIComponent(searchTitle);
      const olResp = await fetch(`https://openlibrary.org/search.json?title=${olQuery}&limit=10`);
      const olJson = await olResp.json();
      if (olJson.docs) {
        for (const doc of olJson.docs) {
          if (doc.cover_i) {
            const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
            candidates.push({ url, source: "Open Library", title: doc.title, id: doc.key });
          } else if (doc.isbn && doc.isbn.length) {
            const url = `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-L.jpg`;
            candidates.push({ url, source: "Open Library", title: doc.title, id: doc.key });
          }
        }
      }
    } catch {
      // ignore
    }

    setCoverCandidates(candidates);
    setCoverPanelOpen(true);
    setCoverLoading(false);
    setCoverLoadingMessage(null);
  };

  const queryAmazonCandidates = async () => {
    setCoverLoading(true);
    setCoverLoadingMessage('Searching Amazon (proxy)...');
    const meta = await bookRef.current?.loaded.metadata.catch(() => ({} as Metadata));
    const searchTitle = meta?.title || title || fileName || '';
    try {
      const resp = await fetch(`http://localhost:4001/search?query=${encodeURIComponent(searchTitle)}`);
      const json = await resp.json();
      if (Array.isArray(json)) {
        const candidates = json.map((x) => {
          const proxied = `http://localhost:4001/image?url=${encodeURIComponent(x.url)}`;
          return { url: proxied, source: x.source || 'Amazon', title: x.title, original: x.url };
        });
        setCoverCandidates(candidates);
        setCoverPanelOpen(true);
      }
    } catch {
      setError('Failed to fetch Amazon candidates; ensure the local proxy is running.');
    }
    setCoverLoading(false);
    setCoverLoadingMessage(null);
  };

  const applyCoverToEpub = async (imageUrl: string) => {
    if (!fileBuffer) {
      setError("Original EPUB file not available to modify.");
      return;
    }

    try {
      const zip = await JSZip.loadAsync(fileBuffer);

      // Find OPF path from META-INF/container.xml
      const containerPath = "META-INF/container.xml";
      const containerFile = zip.file(containerPath);
      if (!containerFile) throw new Error("container.xml not found in EPUB");
      const containerText = await containerFile.async("text");
      const parser = new DOMParser();
      const contDoc = parser.parseFromString(containerText, "application/xml");
      const rootfile = contDoc.querySelector("rootfile");
      const opfPath = rootfile?.getAttribute("full-path") || "";

      if (!opfPath) throw new Error("OPF path not found in container.xml");

      // fetch image (try direct, then proxy if direct fails)
      let imgBuffer: ArrayBuffer;
      try {
        const imgResp = await fetch(imageUrl);
        if (!imgResp.ok) throw new Error('Image fetch failed');
        imgBuffer = await imgResp.arrayBuffer();
      } catch (firstErr) {
        // If the direct fetch failed (likely CORS), try the local proxy if available
        try {
          const proxyUrl = `http://localhost:4001/image?url=${encodeURIComponent(imageUrl)}`;
          const proxied = await fetch(proxyUrl);
          if (!proxied.ok) throw new Error('Proxy image fetch failed');
          imgBuffer = await proxied.arrayBuffer();
        } catch {
          throw firstErr;
        }
      }

      const opfFile = zip.file(opfPath);
      if (!opfFile) throw new Error("OPF file not found");
      const opfText = await opfFile.async("text");
      const opfDoc = parser.parseFromString(opfText, "application/xml");

      // Determine base path for resources
      const basePath = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
      const imageRelPath = `${basePath}images/cover.jpg`;

      // add image file
      // helper: detect image mime type from bytes
      const detectMime = (buf: ArrayBuffer) => {
        try {
          const bytes = new Uint8Array(buf);
          if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
          if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
          if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
          if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) return 'image/webp';
        } catch {
          /* ignore */
        }
        return 'image/jpeg';
      };

      const coverMimeType = detectMime(imgBuffer);
      zip.file(imageRelPath, imgBuffer);

      // update manifest
      const manifest = opfDoc.querySelector("manifest");
      if (manifest) {
        const existing = manifest.querySelector('item[href="images/cover.jpg"]');
        if (!existing) {
          const item = opfDoc.createElement("item");
          item.setAttribute("id", "cover-image");
          item.setAttribute("href", `images/cover.jpg`);
          item.setAttribute("media-type", coverMimeType || "image/jpeg");
          manifest.appendChild(item);
        }
      }

      // add <meta name="cover" content="cover-image"/>
      const metadataEl = opfDoc.querySelector("metadata");
      if (metadataEl) {
        const metaCover = opfDoc.createElement("meta");
        metaCover.setAttribute("name", "cover");
        metaCover.setAttribute("content", "cover-image");
        metadataEl.appendChild(metaCover);
      }

      // Replace cover-related pages: look for manifest/spine items that reference a cover
      try {
        // helper to detect mime type from ArrayBuffer
        const detectMime = (buf: ArrayBuffer) => {
          try {
            const bytes = new Uint8Array(buf);
            if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
            if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
            if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
            if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) return 'image/webp';
          } catch {
            /* ignore */
          }
          return 'application/octet-stream';
        };

        // helper to convert ArrayBuffer to base64
        const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
          let binary = '';
          const bytes = new Uint8Array(buffer);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
          }
          return btoa(binary);
        };

        const coverMime = detectMime(imgBuffer);
        const coverDataUri = `data:${coverMime};base64,${arrayBufferToBase64(imgBuffer)}`;
        const candidatePaths = new Set<string>();

        // Heuristic A: manifest items with id/href/properties containing 'cover'
        const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item'));
        for (const item of manifestItems) {
          const id = item.getAttribute('id') || '';
          const href = item.getAttribute('href') || '';
          const props = item.getAttribute('properties') || '';
          const mediaType = item.getAttribute('media-type') || '';
          if (/cover/i.test(id) || /cover/i.test(href) || /cover/i.test(props)) {
            if (/xhtml|html/i.test(mediaType) || href.match(/\.xhtml?$|\.html?$/i)) {
              candidatePaths.add(basePath + href);
            }
          }
        }

        // Heuristic B: first spine item (often the cover page)
        const spine = opfDoc.querySelector('spine');
        const firstItemref = spine?.querySelector('itemref');
        const firstIdref = firstItemref?.getAttribute('idref');
        if (firstIdref) {
          const mi = opfDoc.querySelector(`manifest > item[id="${firstIdref}"]`);
          const fh = mi?.getAttribute('href');
          if (fh) candidatePaths.add(basePath + fh);
        }

        // Heuristic C: scan all spine items for elements that look like a cover (img with cover in src or class/id)
        const spineItemrefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
        for (const ir of spineItemrefs) {
          const idref = ir.getAttribute('idref') || '';
          const mi = opfDoc.querySelector(`manifest > item[id="${idref}"]`);
          const href = mi?.getAttribute('href') || '';
          const mediaType = mi?.getAttribute('media-type') || '';
          if (!href) continue;
          if (!/xhtml|html/i.test(mediaType) && !href.match(/\.xhtml?$|\.html?$/i)) continue;
          const fullPath = basePath + href;
          const file = zip.file(fullPath);
          if (!file) continue;
          try {
            const txt = await file.async('text');
            const doc = parser.parseFromString(txt, 'text/html');
            const foundImg = doc.querySelector('img[src*="cover"], img[class*="cover"], img[id*="cover"]');
            const foundCoverClass = doc.querySelector('[class*="cover"], [id*="cover"]');
            const foundMetaCover = doc.querySelector('meta[name="cover"]');
            if (foundImg || foundCoverClass || foundMetaCover) candidatePaths.add(fullPath);
          } catch {
            // ignore parse errors for individual spine files
          }
        }



        // Modify each candidate path: replace existing cover <img> src to images/cover.jpg or insert wrapper
        for (const path of candidatePaths) {
          const f = zip.file(path);
          if (!f) continue;
          try {
            const txt = await f.async('text');
            const doc = parser.parseFromString(txt, 'text/html');
            let modified = false;

            // Replace existing cover-like <img> src
            const imgs = Array.from(doc.querySelectorAll('img'));
            for (const img of imgs) {
              const src = img.getAttribute('src') || '';
              if (/cover/i.test(src) || /cover/i.test(img.getAttribute('class') || '') || /cover/i.test(img.getAttribute('id') || '')) {
                // inline as data URI to avoid resolution issues and force sizing styles
                img.setAttribute('src', coverDataUri);
                img.setAttribute('style', 'display:block;max-width:100%;height:auto;margin:0 auto;object-fit:contain;');
                modified = true;
              }
            }

            // If nothing replaced, insert a cover wrapper at the start of <body>
            if (!modified) {
              const body = doc.querySelector('body');
              if (body) {
                const wrapper = doc.createElement('div');
                wrapper.setAttribute('class', 'cover-wrapper');
                wrapper.setAttribute('style', 'display:flex;align-items:center;justify-content:center;padding:0;margin:0;');
                const img = doc.createElement('img');
                img.setAttribute('src', coverDataUri);
                img.setAttribute('alt', 'Cover');
                img.setAttribute('style', 'max-width:100%;max-height:100vh;width:auto;height:auto;object-fit:contain;display:block;margin:0 auto;');
                wrapper.appendChild(img);
                body.insertBefore(wrapper, body.firstChild);
                modified = true;
              }
            }

            if (modified) {
              const localSerializer = new XMLSerializer();
              const newText = localSerializer.serializeToString(doc);
              zip.file(path, newText);
            }
          } catch {
            // non-fatal for individual candidate files
          }
        }
      } catch {
        // non-fatal: continue if we can't update cover pages
      }

      const serializer = new XMLSerializer();
      const newOpfText = serializer.serializeToString(opfDoc);
      zip.file(opfPath, newOpfText);

      // Repack EPUB ensuring the 'mimetype' file is the first entry and uncompressed
      const outZip = new JSZip();
      // Preserve mimetype as first, uncompressed entry if present
      const mimeFile = zip.file('mimetype');
      if (mimeFile) {
        try {
          const mimeBuf = await mimeFile.async('arraybuffer');
          outZip.file('mimetype', mimeBuf, { compression: 'STORE' });
        } catch {
          // ignore
        }
      }

      // Copy all other files from original zip into outZip
      const filesToCopy: string[] = [];
      zip.forEach((relativePath) => filesToCopy.push(relativePath));
      for (const path of filesToCopy) {
        if (path === 'mimetype') continue;
        const f = zip.file(path);
        if (!f) continue;
        try {
          const data = await f.async('arraybuffer');
          outZip.file(path, data);
        } catch {
          // fallback: try as text
          try {
            const text = await f.async('text');
            outZip.file(path, text);
          } catch {
            // give up on this file
          }
        }
      }

      const newBlob = await outZip.generateAsync({ type: 'blob' });
      // show preview immediately (create blob from fetched buffer)
      try {
        const imgBlob = new Blob([imgBuffer]);
        const previewUrl = URL.createObjectURL(imgBlob);
        if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
        setCoverPreviewUrl(previewUrl);
      } catch {
        // ignore preview generation errors
      }

      const outName = fileName ? fileName.replace(/\.epub$/i, "") + "-with-cover.epub" : "book-with-cover.epub";
      saveAs(newBlob, outName);

      // reload reader from the modified EPUB so cover is reflected in-app
      try {
        const newUrl = URL.createObjectURL(newBlob);
        // keep reference to revoke later
        if (currentUrlRef.current) {
          try {
            URL.revokeObjectURL(currentUrlRef.current);
          } catch {
            /* ignore */
          }
        }
        // destroy current in-memory book first
        renditionRef.current?.destroy();
        bookRef.current?.destroy();
        renditionRef.current = null;
        bookRef.current = null;
        currentUrlRef.current = newUrl;

        const newBook = ePub(newUrl) as unknown as BookLike;
        bookRef.current = newBook;
        await newBook.ready;
        const metadata = await newBook.loaded.metadata;
        setTitle(metadata.title || fileName);

        if (!viewerRef.current) throw new Error("Viewer not ready");
        const rendition = newBook.renderTo(viewerRef.current, {
          width: viewerRef.current.offsetWidth,
          height: viewerRef.current.offsetHeight,
          spread: viewMode === "double" ? "auto" : "none",
        });
        renditionRef.current = rendition;
        applyReaderStyles(rendition);
        await rendition.display();
        setHasBook(true);
      } catch {
        // ignore reload errors; book was saved/downloaded
      }

      setCoverPanelOpen(false);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <main className={`app-shell ${isDarkMode ? "theme-dark" : "theme-light"}`}>
      <header className="topbar">
        <h1>OpenShelf</h1>

        <label className="file-input">
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,application/epub+zip"
            onChange={loadFile}
          />
          <span>Open EPUB</span>
        </label>
      </header>

      <section className="book-meta">
        <div className="meta-left">
          <strong>{title}</strong>
          <small>{fileName || "Choose an EPUB file to start reading."}</small>
        </div>
        {coverPreviewUrl && (
          <div className="cover-thumb">
            <img src={coverPreviewUrl} alt="cover preview" />
          </div>
        )}
      </section>

      {error && <p className="error-text">{error}</p>}

      <section className="controls">
        <button type="button" onClick={goPrevious} disabled={!hasBook}>
          Previous
        </button>
        <button type="button" onClick={goNext} disabled={!hasBook}>
          Next
        </button>
        <button type="button" onClick={toggleViewMode} disabled={!hasBook}>
          {viewMode === "single" ? "1 Page" : "2 Pages"}
        </button>

        <label>
          Size
          <select value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))}>
            {[90, 100, 110, 120, 140].map((size) => (
              <option key={size} value={size}>
                {size}%
              </option>
            ))}
          </select>
        </label>

        <label>
          Letter
          <select
            value={letterSpacing}
            onChange={(event) => setLetterSpacing(Number(event.target.value))}
          >
            {[0, 0.01, 0.03, 0.05].map((space) => (
              <option key={space} value={space}>
                {space.toFixed(2)}em
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={() => setIsDarkMode((prev) => !prev)}>
          {isDarkMode ? "Light mode" : "Dark mode"}
        </button>

        <button type="button" onClick={queryCoverCandidates} disabled={!hasBook}>
          Find covers
        </button>
        <button type="button" onClick={queryAmazonCandidates} disabled={!hasBook}>
          Find Amazon covers
        </button>
      </section>

      <article className="viewer-wrap">
        <div ref={viewerRef} className={`viewer ${!hasBook ? "viewer-empty" : ""}`}>
          {!hasBook && (
            <button
              type="button"
              className="empty-state"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Open EPUB file"
            >
              <strong>No book selected</strong>
              <p>Open an EPUB file to start reading.</p>
            </button>
          )}
        </div>
      </article>

      {coverPanelOpen && (
        <div className="cover-panel">
          <header>
            <strong>Cover candidates</strong>
            <button onClick={() => setCoverPanelOpen(false)}>Close</button>
          </header>
          <div className="cover-grid">
            {coverCandidates.length === 0 && <p>No candidates found.</p>}
            {coverCandidates.map((c, idx) => (
              <div
                  key={idx}
                  className={`cover-item ${selectedCoverUrl === (c.original || c.url) ? 'selected' : ''}`}
                  onClick={() => setSelectedCoverUrl(c.original || c.url)}
                  role="button"
                  tabIndex={0}
                >
                  <img src={c.url} alt={c.title || 'cover'} />
                  <div className="meta">{c.source}</div>
                </div>
            ))}
            <div className="cover-item">
              <label style={{width: '100%'}}>
                Paste image URL
                <input
                  type="text"
                  value={manualCoverUrl}
                  onChange={(e) => setManualCoverUrl(e.target.value)}
                  placeholder="https://.../cover.jpg"
                />
              </label>
              <div className="actions">
                <button
                  onClick={() => manualCoverUrl && applyCoverToEpub(manualCoverUrl.trim())}
                  disabled={coverLoading || !manualCoverUrl}
                >
                  Use URL
                </button>
              </div>
            </div>
            <div style={{gridColumn: '1/-1', display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button disabled={!selectedCoverUrl || coverLoading} onClick={() => selectedCoverUrl && applyCoverToEpub(selectedCoverUrl)}>
                Use selected cover
              </button>
            </div>
          </div>
          {coverLoading && (
            <div className="cover-loading">
              <div className="spinner" />
              <div>{coverLoadingMessage || "Working..."}</div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default App;
