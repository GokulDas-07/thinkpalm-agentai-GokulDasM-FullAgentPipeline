"use client";

import type { ComponentNode, ComponentTree } from "@/types/component-tree";
import { flattenTree } from "@/types/component-tree";
import JSZip from "jszip";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";

export interface CodeExportProps {
  componentTree: ComponentTree | null;
  generatedCodes: Record<string, string>;
}

const EMPTY_ROOTS: ComponentNode[] = [];

function safeComponentFilename(name: string): string {
  const base = name.replace(/[^\w]+/g, "");
  return base || "Component";
}

function buildFileHeaderComment(name: string): string {
  return `// ========== ${name}.tsx ==========\n`;
}

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./index.tsx"],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

function buildIndexExports(nodes: ComponentNode[], codes: Record<string, string>): string {
  const withCode = nodes.filter((n) => codes[n.id]?.trim());
  const lines = withCode.map((n) => {
    const fileBase = safeComponentFilename(n.name);
    return `export * from "./src/components/${fileBase}";`;
  });
  return `${lines.join("\n")}\n`;
}

export function CodeExport({
  componentTree,
  generatedCodes,
}: CodeExportProps) {
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const flat = useMemo(
    () => flattenTree(componentTree?.rootComponents ?? EMPTY_ROOTS),
    [componentTree],
  );

  const nodesWithCode = useMemo(
    () => flat.filter((n) => generatedCodes[n.id]?.trim()),
    [flat, generatedCodes],
  );

  const totalLines = useMemo(() => {
    let n = 0;
    for (const node of nodesWithCode) {
      const code = generatedCodes[node.id] ?? "";
      n += code.split("\n").length;
    }
    return n;
  }, [nodesWithCode, generatedCodes]);

  const codesSignature = useMemo(
    () =>
      Object.keys(generatedCodes)
        .filter((id) => generatedCodes[id]?.trim())
        .sort()
        .join("\0"),
    [generatedCodes],
  );
  const prevCodesSignature = useRef<string | null>(null);

  useEffect(() => {
    if (prevCodesSignature.current === codesSignature) {
      return;
    }
    prevCodesSignature.current = codesSignature;
    const first = flat.find((n) => generatedCodes[n.id]?.trim());
    startTransition(() => {
      setSelectedComponentId(first?.id ?? null);
    });
  }, [codesSignature, flat, generatedCodes]);

  const selectedNode = useMemo(
    () => flat.find((n) => n.id === selectedComponentId) ?? null,
    [flat, selectedComponentId],
  );

  const selectedCode =
    selectedNode && generatedCodes[selectedNode.id]
      ? generatedCodes[selectedNode.id]
      : "";

  const hasSelectedCode = Boolean(selectedCode.trim());

  const copyAll = useCallback(async () => {
    if (nodesWithCode.length === 0) {
      return;
    }
    const parts = nodesWithCode.map((n) => {
      const code = generatedCodes[n.id] ?? "";
      return `${buildFileHeaderComment(safeComponentFilename(n.name))}${code}`;
    });
    const text = parts.join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }, [nodesWithCode, generatedCodes]);

  const copySelected = useCallback(async () => {
    if (!selectedNode || !hasSelectedCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedCode);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [selectedNode, selectedCode, hasSelectedCode]);

  const exportZip = useCallback(async () => {
    if (nodesWithCode.length === 0) {
      return;
    }
    const zip = new JSZip();
    for (const n of nodesWithCode) {
      const fileBase = safeComponentFilename(n.name);
      zip.file(
        `src/components/${fileBase}.tsx`,
        generatedCodes[n.id] ?? "",
      );
    }
    zip.file("index.tsx", buildIndexExports(flat, generatedCodes));
    zip.file("tailwind.config.js", TAILWIND_CONFIG);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spectoui-components.zip";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [flat, generatedCodes, nodesWithCode]);

  const lineCount = hasSelectedCode ? selectedCode.split("\n").length : 0;
  const displayName = selectedNode
    ? `${safeComponentFilename(selectedNode.name)}.tsx`
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-950">
      <header className="flex shrink-0 flex-row items-center justify-between gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Code Export
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            disabled={nodesWithCode.length === 0}
            onClick={() => void copyAll()}
          >
            Copy all
          </button>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            disabled={nodesWithCode.length === 0}
            onClick={() => void exportZip()}
          >
            Export ZIP
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <aside className="w-44 shrink-0 overflow-y-auto border-r border-zinc-200 p-2 dark:border-zinc-800">
          <ul className="space-y-0.5">
            {flat.map((n) => {
              const hasCode = Boolean(generatedCodes[n.id]?.trim());
              const active = n.id === selectedComponentId;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedComponentId(n.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? "bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
                        : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        hasCode ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                      aria-hidden
                    />
                    <span className="truncate">{n.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-4">
          {!selectedNode ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a component.
            </p>
          ) : !hasSelectedCode ? (
            <div className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 w-[92%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 w-4/5 max-w-md animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-start justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
                <div>
                  <p className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {displayName}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {lineCount} lines
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => void copySelected()}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg text-sm">
                <SyntaxHighlighter
                  language="tsx"
                  style={oneDark}
                  showLineNumbers={false}
                  PreTag="div"
                  className="rounded-lg p-4 !m-0"
                >
                  {selectedCode}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="shrink-0 border-t border-zinc-200 p-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {nodesWithCode.length} components · {totalLines} lines of code total
      </footer>
    </div>
  );
}
