import { ChangeEvent, useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import "./App.css";

type TocItem = {
  href: string;
  label: string;
};

type Navigation = {
  toc?: TocItem[];
};

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
};

type BookLike = {
  ready: Promise<unknown>;
  loaded: {
    metadata: Promise<Metadata>;
    navigation: Promise<Navigation>;
  };
  renderTo: (
    element: HTMLElement,
    options: { width?: string | number; height?: string | number; spread?: string },
  ) => RenditionLike;
  destroy: () => void;
};

function App() {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<BookLike | null>(null);
  const renditionRef = useRef<RenditionLike | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [title, setTitle] = useState<string>("No book loaded");
  const [toc, setToc] = useState<TocItem[]>([]);
  const [error, setError] = useState<string>("");
  const [hasBook, setHasBook] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "double">("single");

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
    setToc([]);
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

      const navigation = await book.loaded.navigation;
      setToc(
        (navigation.toc || []).map((item) => ({
          href: item.href,
          label: item.label,
        })),
      );

      const container = viewerRef.current!;
      const rendition = book.renderTo(container, {
        width: container.offsetWidth,
        height: container.offsetHeight,
        spread: viewMode === "double" ? "auto" : "none",
      });

      renditionRef.current = rendition;
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

  const goToTocItem = async (href: string) => {
    if (renditionRef.current) {
      await renditionRef.current.display(href);
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>OpenShelf</h1>
          <p>Local EPUB Reader</p>
        </div>

        <label className="file-input">
          <input type="file" accept=".epub,application/epub+zip" onChange={loadFile} />
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
      </section>

      <section className="layout">
        <aside className="toc">
          <h2>Contents</h2>
          {toc.length === 0 ? (
            <p>No table of contents yet.</p>
          ) : (
            <ul>
              {toc.map((item) => (
                <li key={item.href}>
                  <button type="button" onClick={() => goToTocItem(item.href)}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <article className="viewer-wrap">
          <div ref={viewerRef} className="viewer" />
        </article>
      </section>
    </main>
  );
}

export default App;
