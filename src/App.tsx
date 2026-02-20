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
    { url: string; source: string; title?: string; id?: string }[]
  >([]);
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

    // Google Books search
    try {
      const gbQuery = encodeURIComponent(`${searchTitle} ${authors}`.trim());
      const gbResp = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${gbQuery}&maxResults=10`,
      );
      const gbJson = await gbResp.json();
      if (gbJson.items) {
        for (const item of gbJson.items) {
          const info = item.volumeInfo || {};
          if (info.imageLinks && info.imageLinks.thumbnail) {
            candidates.push({ url: info.imageLinks.thumbnail, source: "Google Books", title: info.title, id: item.id });
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

      // fetch image
      const imgResp = await fetch(imageUrl);
      const imgBuffer = await imgResp.arrayBuffer();

      const opfFile = zip.file(opfPath);
      if (!opfFile) throw new Error("OPF file not found");
      const opfText = await opfFile.async("text");
      const opfDoc = parser.parseFromString(opfText, "application/xml");

      // Determine base path for resources
      const basePath = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
      const imageRelPath = `${basePath}images/cover.jpg`;

      // add image file
      zip.file(imageRelPath, imgBuffer);

      // update manifest
      const manifest = opfDoc.querySelector("manifest");
      if (manifest) {
        const existing = manifest.querySelector('item[href="images/cover.jpg"]');
        if (!existing) {
          const item = opfDoc.createElement("item");
          item.setAttribute("id", "cover-image");
          item.setAttribute("href", `images/cover.jpg`);
          item.setAttribute("media-type", "image/jpeg");
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

      const serializer = new XMLSerializer();
      const newOpfText = serializer.serializeToString(opfDoc);
      zip.file(opfPath, newOpfText);

      const newBlob = await zip.generateAsync({ type: "blob" });
      // show preview immediately
      try {
        const imgResp = await fetch(imageUrl);
        const imgBuf = await imgResp.blob();
        const previewUrl = URL.createObjectURL(imgBuf);
        // revoke previous preview if present
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
              <div key={idx} className="cover-item">
                <img src={c.url} alt={c.title || "cover"} />
                <div className="meta">{c.source}</div>
                <div className="actions">
                  <a href={c.url} target="_blank" rel="noreferrer">Open</a>
                  <button onClick={() => applyCoverToEpub(c.url)} disabled={coverLoading}>Use as cover</button>
                </div>
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
