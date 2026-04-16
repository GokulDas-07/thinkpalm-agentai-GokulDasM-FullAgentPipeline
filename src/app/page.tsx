"use client";

import { CodeExport } from "@/components/CodeExport";
import { ComponentPreview } from "@/components/ComponentPreview";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import { PrdEditor } from "@/components/PrdEditor";
import { useGenerate } from "@/hooks/useGenerate";
import { useTheme } from "next-themes";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const SPLITTER_GAP_PX = 16;
const MIN_PRD_WIDTH = 220;
const MIN_CODE_WIDTH = 280;
const MIN_CENTER_WIDTH = 260;
const DEFAULT_PRD_WIDTH = 320;
const DEFAULT_CODE_WIDTH = 384;

function subscribeMdMedia(cb: () => void) {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getMdMediaMatches() {
  return window.matchMedia("(min-width: 768px)").matches;
}

function clampPanelWidths(
  containerWidth: number,
  prd: number,
  code: number,
): { prd: number; code: number } {
  let p = prd;
  let c = code;
  for (let i = 0; i < 6; i++) {
    const maxP = containerWidth - MIN_CENTER_WIDTH - c - SPLITTER_GAP_PX;
    p = Math.min(Math.max(MIN_PRD_WIDTH, p), Math.max(MIN_PRD_WIDTH, maxP));
    const maxC = containerWidth - MIN_CENTER_WIDTH - p - SPLITTER_GAP_PX;
    c = Math.min(Math.max(MIN_CODE_WIDTH, c), Math.max(MIN_CODE_WIDTH, maxC));
  }
  return { prd: p, code: c };
}

function SunIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function Home() {
  const [prdText, setPrdText] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(
    null,
  );
  const [dismissedErrorMessage, setDismissedErrorMessage] = useState<
    string | null
  >(null);
  const errorAutoDismissRef = useRef<number | null>(null);
  const mainRowRef = useRef<HTMLDivElement>(null);
  const prdWidthRef = useRef(DEFAULT_PRD_WIDTH);
  const codeWidthRef = useRef(DEFAULT_CODE_WIDTH);

  const [prdPanelWidth, setPrdPanelWidth] = useState(DEFAULT_PRD_WIDTH);
  const [codePanelWidth, setCodePanelWidth] = useState(DEFAULT_CODE_WIDTH);
  const [panelDrag, setPanelDrag] = useState<
    | null
    | {
        kind: "prd" | "code";
        startX: number;
        startPrd: number;
        startCode: number;
      }
  >(null);

  const isDesktopLayout = useSyncExternalStore(
    subscribeMdMedia,
    getMdMediaMatches,
    () => false,
  );

  useEffect(() => {
    prdWidthRef.current = prdPanelWidth;
  }, [prdPanelWidth]);

  useEffect(() => {
    codeWidthRef.current = codePanelWidth;
  }, [codePanelWidth]);

  const {
    status,
    statusMessage,
    progress,
    componentTree,
    generatedCodes,
    generationSummary,
    error,
    prdHistory,
    generateFromPrd,
    reset,
  } = useGenerate();

  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (error !== null) {
      return;
    }
    queueMicrotask(() => {
      setDismissedErrorMessage(null);
    });
  }, [error]);

  useEffect(() => {
    if (errorAutoDismissRef.current !== null) {
      window.clearTimeout(errorAutoDismissRef.current);
      errorAutoDismissRef.current = null;
    }
    if (!error) {
      return;
    }
    if (dismissedErrorMessage === error) {
      return;
    }
    errorAutoDismissRef.current = window.setTimeout(() => {
      errorAutoDismissRef.current = null;
      setDismissedErrorMessage(error);
    }, 5000);
    return () => {
      if (errorAutoDismissRef.current !== null) {
        window.clearTimeout(errorAutoDismissRef.current);
        errorAutoDismissRef.current = null;
      }
    };
  }, [error, dismissedErrorMessage]);

  const showErrorToast = Boolean(
    error && dismissedErrorMessage !== error,
  );

  const dismissErrorToast = useCallback(() => {
    if (!error) {
      return;
    }
    if (errorAutoDismissRef.current !== null) {
      window.clearTimeout(errorAutoDismissRef.current);
      errorAutoDismissRef.current = null;
    }
    setDismissedErrorMessage(error);
  }, [error]);

  useEffect(() => {
    if (!panelDrag) {
      return;
    }
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const onMove = (e: PointerEvent) => {
      const row = mainRowRef.current;
      if (!row) {
        return;
      }
      const w = row.getBoundingClientRect().width;
      if (panelDrag.kind === "prd") {
        const next =
          panelDrag.startPrd + (e.clientX - panelDrag.startX);
        const maxPrd =
          w -
          MIN_CENTER_WIDTH -
          codeWidthRef.current -
          SPLITTER_GAP_PX;
        setPrdPanelWidth(
          Math.min(
            Math.max(MIN_PRD_WIDTH, next),
            Math.max(MIN_PRD_WIDTH, maxPrd),
          ),
        );
      } else {
        const next =
          panelDrag.startCode - (e.clientX - panelDrag.startX);
        const maxCode =
          w -
          MIN_CENTER_WIDTH -
          prdWidthRef.current -
          SPLITTER_GAP_PX;
        setCodePanelWidth(
          Math.min(
            Math.max(MIN_CODE_WIDTH, next),
            Math.max(MIN_CODE_WIDTH, maxCode),
          ),
        );
      }
    };
    const onUp = () => setPanelDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [panelDrag]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }
    const onResize = () => {
      const row = mainRowRef.current;
      if (!row) {
        return;
      }
      const w = row.getBoundingClientRect().width;
      const { prd, code } = clampPanelWidths(
        w,
        prdWidthRef.current,
        codeWidthRef.current,
      );
      setPrdPanelWidth(prd);
      setCodePanelWidth(code);
    };
    window.addEventListener("resize", onResize);
    queueMicrotask(onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isDesktopLayout]);

  const handleLoadFromHistory = useCallback(
    (text: string) => {
      setPrdText(text);
      reset();
    },
    [reset],
  );

  const handleReset = useCallback(() => {
    reset();
    setPrdText("");
    setSelectedComponentId(null);
  }, [reset]);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const showReset = status === "done" || componentTree !== null;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-selected-component={selectedComponentId ?? undefined}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            SpecToUI
          </span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            beta
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showReset ? (
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              onClick={handleReset}
            >
              Reset
            </button>
          ) : null}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            onClick={toggleTheme}
            aria-label={
              resolvedTheme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <div
        ref={mainRowRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
      >
        <div
          className="flex min-h-0 w-full shrink-0 flex-col border-gray-200 md:h-full md:w-auto md:shrink-0 md:border-r-0 dark:border-gray-800"
          style={
            isDesktopLayout ? { width: prdPanelWidth, flexShrink: 0 } : undefined
          }
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            <PrdEditor
              value={prdText}
              onChange={setPrdText}
              onGenerate={() => void generateFromPrd(prdText)}
              isLoading={status === "running"}
              statusMessage={statusMessage}
              progress={progress}
              prdHistory={prdHistory}
              onLoadFromHistory={handleLoadFromHistory}
            />
          </div>
          <p className="shrink-0 border-t border-gray-200 p-3 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 md:hidden">
            Open on desktop for full experience
          </p>
        </div>

        <div className="hidden h-full shrink-0 md:block">
          <PanelResizeHandle
            ariaLabel="Resize PRD and preview panels"
            onPointerDownClientX={(clientX) =>
              setPanelDrag({
                kind: "prd",
                startX: clientX,
                startPrd: prdPanelWidth,
                startCode: codePanelWidth,
              })
            }
          />
        </div>

        <div className="hidden min-h-0 min-w-0 flex-1 overflow-hidden md:flex">
          <ComponentPreview
            componentTree={componentTree}
            generatedCodes={generatedCodes}
            statusMessage={statusMessage}
            isLoading={status === "running"}
          />
        </div>

        <div className="hidden h-full shrink-0 md:block">
          <PanelResizeHandle
            ariaLabel="Resize preview and code export panels"
            onPointerDownClientX={(clientX) =>
              setPanelDrag({
                kind: "code",
                startX: clientX,
                startPrd: prdPanelWidth,
                startCode: codePanelWidth,
              })
            }
          />
        </div>

        <div
          className="hidden h-full shrink-0 overflow-hidden border-gray-200 md:block md:border-l-0 dark:border-gray-800"
          style={
            isDesktopLayout
              ? { width: codePanelWidth, flexShrink: 0 }
              : undefined
          }
        >
          <CodeExport
            componentTree={componentTree}
            generatedCodes={generatedCodes}
            generationSummary={generationSummary}
          />
        </div>
      </div>

      {showErrorToast ? (
        <div
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-red-200 bg-red-50 p-3 shadow-lg dark:border-red-900 dark:bg-red-950"
          role="alert"
        >
          <div className="flex gap-2">
            <p className="flex-1 text-sm text-red-900 dark:text-red-100">
              Error: {error}
            </p>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900"
              aria-label="Dismiss error"
              onClick={dismissErrorToast}
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
