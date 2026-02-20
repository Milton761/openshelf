import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import "./App.css";

type Metadata = {
  title?: string;
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

      const fileBuffer = await file.arrayBuffer();
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
        <strong>{title}</strong>
        <small>{fileName || "Choose an EPUB file to start reading."}</small>
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

        <button type="button" onClick={() => setIsDarkMode((prev) => !prev)} disabled={!hasBook}>
          {isDarkMode ? "Light mode" : "Dark mode"}
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
    </main>
  );
}

export default App;
