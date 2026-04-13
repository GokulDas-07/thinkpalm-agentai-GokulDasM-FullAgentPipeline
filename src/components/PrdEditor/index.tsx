"use client";

import { SAMPLE_PRDS } from "@/lib/prompts";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { OnMount } from "@monaco-editor/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
        Loading editor…
      </div>
    ),
  },
);

const SAMPLE_OPTIONS = [
  { key: "ecommerce" as const, label: "E-commerce" },
  { key: "dashboard" as const, label: "Dashboard" },
  { key: "onboarding" as const, label: "Onboarding" },
];

export interface PrdEditorProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  statusMessage: string;
  progress: number;
  prdHistory: Array<{
    prdText: string;
    pageTitle: string;
    componentCount: number;
    createdAt: string;
  }>;
  onLoadFromHistory: (prdText: string) => void;
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PrdEditor({
  value,
  onChange,
  onGenerate,
  isLoading,
  statusMessage,
  progress,
  prdHistory,
  onLoadFromHistory,
}: PrdEditorProps) {
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === "dark" ? "vs-dark" : "vs";

  const [sampleOpen, setSampleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);

  const sampleWrapRef = useRef<HTMLDivElement>(null);
  const historyWrapRef = useRef<HTMLDivElement>(null);
  const onGenerateRef = useRef(onGenerate);

  const fileInputId = useId();

  useEffect(() => {
    onGenerateRef.current = onGenerate;
  }, [onGenerate]);

  useEffect(() => {
    if (!sampleOpen && !historyOpen) {
      return;
    }
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sampleOpen && !sampleWrapRef.current?.contains(t)) {
        setSampleOpen(false);
      }
      if (historyOpen && !historyWrapRef.current?.contains(t)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [sampleOpen, historyOpen]);

  const readFileAsText = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        setLoadedFileName(file.name);
        onChange(text);
      };
      reader.readAsText(file);
    },
    [onChange],
  );

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        readFileAsText(file);
      }
      e.target.value = "";
    },
    [readFileAsText],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (!file) {
        return;
      }
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".txt") && !lower.endsWith(".md")) {
        return;
      }
      readFileAsText(file);
    },
    [readFileAsText],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onGenerateRef.current();
    });
  }, []);

  const handleEditorChange = useCallback(
    (v: string | undefined) => {
      onChange(v ?? "");
    },
    [onChange],
  );

  const selectSample = useCallback(
    (key: (typeof SAMPLE_OPTIONS)[number]["key"]) => {
      onChange(SAMPLE_PRDS[key]);
      setLoadedFileName(null);
      setSampleOpen(false);
    },
    [onChange],
  );

  const barWidth = Math.min(100, Math.max(0, progress));

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex shrink-0 flex-row items-center justify-between gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          PRD Input
        </span>
        <div className="flex items-center gap-2">
          <div className="relative" ref={sampleWrapRef}>
            <button
              type="button"
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-expanded={sampleOpen}
              aria-haspopup="menu"
              onClick={() => {
                setSampleOpen((o) => !o);
                setHistoryOpen(false);
              }}
            >
              Sample
            </button>
            {sampleOpen ? (
              <ul
                className="absolute right-0 z-20 mt-1 min-w-40 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                role="menu"
              >
                {SAMPLE_OPTIONS.map(({ key, label }) => (
                  <li key={key}>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-3 py-2 text-left text-xs text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => selectSample(key)}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="relative" ref={historyWrapRef}>
            <button
              type="button"
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-expanded={historyOpen}
              onClick={() => {
                setHistoryOpen((o) => !o);
                setSampleOpen(false);
              }}
            >
              History
            </button>
            {historyOpen ? (
              <div className="absolute right-0 z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {prdHistory.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                    No history yet.
                  </p>
                ) : (
                  <ul className="py-1">
                    {prdHistory.map((item, i) => (
                      <li key={`${item.createdAt}-${i}`}>
                        <button
                          type="button"
                          className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          onClick={() => {
                            onLoadFromHistory(item.prdText);
                            setLoadedFileName(null);
                            setHistoryOpen(false);
                          }}
                        >
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {item.pageTitle}
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {item.componentCount} components ·{" "}
                            {formatHistoryDate(item.createdAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <input
          id={fileInputId}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="sr-only"
          onChange={onFileInputChange}
        />
        <label htmlFor={fileInputId}>
          <div
            className="cursor-pointer rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/60"
            onDrop={onDrop}
            onDragOver={onDragOver}
            role="presentation"
          >
            Drop .txt or .md file
            {loadedFileName ? (
              <span className="mt-1 block font-medium text-zinc-800 dark:text-zinc-200">
                {loadedFileName}
              </span>
            ) : null}
          </div>
        </label>
      </div>

      <div className="relative min-h-0 flex-1">
        <MonacoEditor
          height="100%"
          width="100%"
          language="markdown"
          theme={monacoTheme}
          value={value}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            wordWrap: "on",
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            padding: { top: 8 },
          }}
          className="absolute inset-0 min-h-0"
        />
      </div>

      <footer className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex flex-row items-center justify-between gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {value.length} characters
          </span>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            disabled={isLoading || value.length < 50}
            onClick={onGenerate}
          >
            Generate UI
          </button>
        </div>
        {isLoading ? (
          <div className="mt-3 space-y-2">
            <svg
              className="h-1 w-full text-blue-500"
              viewBox="0 0 100 1"
              preserveAspectRatio="none"
              aria-hidden
            >
              <rect
                width="100"
                height="1"
                className="fill-zinc-200 dark:fill-zinc-700"
                rx="0.5"
              />
              <rect
                width={barWidth}
                height="1"
                className="fill-current transition-[width] duration-300 ease-out"
                rx="0.5"
              />
            </svg>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {statusMessage}
            </p>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
