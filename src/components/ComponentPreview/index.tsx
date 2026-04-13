"use client";

import sdk from "@stackblitz/sdk";
import type { ComponentNode, ComponentTree } from "@/types/component-tree";
import { useMemo, useState } from "react";
import { TreeView } from "./TreeView";

const EMPTY_ROOTS: ComponentNode[] = [];

export interface ComponentPreviewProps {
  componentTree: ComponentTree | null;
  generatedCodes: Record<string, string>;
  statusMessage: string;
  isLoading: boolean;
}

function findNodeById(
  nodes: ComponentNode[],
  id: string | null,
): ComponentNode | null {
  if (!id) {
    return null;
  }
  for (const n of nodes) {
    if (n.id === id) {
      return n;
    }
    if (n.children?.length) {
      const found = findNodeById(n.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function filePathForComponentId(id: string): string {
  const safe = id.replace(/[^\w.-]+/g, "_");
  return `src/generated/${safe}.tsx`;
}

const STACKBLITZ_BASE_FILES: Record<string, string> = {
  "package.json": `{
  "name": "spectoui-preview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "~5.6.0",
    "vite": "^5.4.0"
  }
}`,
  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
  "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SpecToUI Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src"]
}`,
  "src/main.tsx": `import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
`,
  "src/App.tsx": `export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>SpecToUI Preview</h1>
      <p style={{ marginTop: 8, fontSize: "0.875rem", color: "#52525b" }}>
        Generated components are in <code>src/generated</code>. Import them here to preview.
      </p>
    </main>
  );
}
`,
};

function openStackBlitzWithCodes(generatedCodes: Record<string, string>) {
  const files: Record<string, string> = { ...STACKBLITZ_BASE_FILES };
  for (const [id, code] of Object.entries(generatedCodes)) {
    files[filePathForComponentId(id)] = code;
  }
  sdk.openProject({
    title: "SpecToUI Preview",
    template: "node",
    files,
  });
}

export function ComponentPreview({
  componentTree,
  generatedCodes,
  statusMessage,
  isLoading,
}: ComponentPreviewProps) {
  const [activeTab, setActiveTab] = useState<"tree" | "preview">("tree");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const roots = componentTree?.rootComponents ?? EMPTY_ROOTS;
  const selectedNode = useMemo(
    () => findNodeById(roots, selectedNodeId),
    [roots, selectedNodeId],
  );

  const hasGenerated = Object.keys(generatedCodes).length > 0;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-white dark:bg-zinc-950">
      {isLoading ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 dark:bg-zinc-950/80"
          role="status"
          aria-live="polite"
        >
          <div
            className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
            aria-hidden
          />
          <p className="max-w-sm px-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {statusMessage}
          </p>
        </div>
      ) : null}

      <div className="flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "tree"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
          onClick={() => setActiveTab("tree")}
        >
          Tree
        </button>
        <button
          type="button"
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "preview"
              ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
      </div>

      {activeTab === "tree" ? (
        <div className="flex min-h-0 flex-1">
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
            {roots.length > 0 ? (
              <TreeView
                nodes={roots}
                selectedId={selectedNodeId}
                onSelect={setSelectedNodeId}
              />
            ) : (
              <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
                No component tree yet.
              </p>
            )}
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {selectedNode ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedNode.name}
                  </h2>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      selectedNode.type === "layout"
                        ? "bg-purple-100 text-purple-700"
                        : selectedNode.type === "section"
                          ? "bg-blue-100 text-blue-700"
                          : selectedNode.type === "ui"
                            ? "bg-green-100 text-green-700"
                            : selectedNode.type === "form"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {selectedNode.type}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {selectedNode.description}
                </p>

                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Props
                </h3>
                <div className="mt-2 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[280px] text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-100 text-left dark:border-zinc-700 dark:bg-zinc-800">
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">
                          name
                        </th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">
                          type
                        </th>
                        <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">
                          required
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNode.props.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-2 text-zinc-500 dark:text-zinc-400"
                          >
                            No props declared.
                          </td>
                        </tr>
                      ) : (
                        selectedNode.props.map((p, i) => (
                          <tr
                            key={`${p.name}-${i}`}
                            className={
                              i % 2 === 0
                                ? "bg-white dark:bg-zinc-950"
                                : "bg-zinc-50 dark:bg-zinc-900/60"
                            }
                          >
                            <td className="px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                              {p.name}
                            </td>
                            <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                              {p.type}
                            </td>
                            <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                              {p.required ? "yes" : "no"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Tailwind classes
                </h3>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedNode.tailwindClasses.length === 0 ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      None
                    </span>
                  ) : (
                    selectedNode.tailwindClasses.map((c) => (
                      <code
                        key={c}
                        className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        {c}
                      </code>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Select a component in the tree to see details.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          {hasGenerated ? (
            <>
              <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                Export your components and open in StackBlitz to preview.
              </p>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                onClick={() => openStackBlitzWithCodes(generatedCodes)}
              >
                Open in StackBlitz
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No components generated yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
