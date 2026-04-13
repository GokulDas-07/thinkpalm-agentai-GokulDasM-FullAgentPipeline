"use client";

import type { ComponentNode } from "@/types/component-tree";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

export interface TreeViewProps {
  nodes: ComponentNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}

function buildInitiallyExpanded(nodes: ComponentNode[]): Set<string> {
  const set = new Set<string>();
  const walk = (list: ComponentNode[], d: number) => {
    for (const n of list) {
      if (d < 2) {
        set.add(n.id);
      }
      if (n.children?.length) {
        walk(n.children, d + 1);
      }
    }
  };
  walk(nodes, 0);
  return set;
}

const BADGE: Record<
  ComponentNode["type"],
  { bg: string; text: string }
> = {
  layout: { bg: "bg-purple-100", text: "text-purple-700" },
  section: { bg: "bg-blue-100", text: "text-blue-700" },
  ui: { bg: "bg-green-100", text: "text-green-700" },
  form: { bg: "bg-yellow-100", text: "text-yellow-700" },
  data: { bg: "bg-gray-100", text: "text-gray-700" },
};

interface TreeNodeProps {
  node: ComponentNode;
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function TreeNode({
  node,
  depth,
  expanded,
  toggleExpanded,
  selectedId,
  onSelect,
}: TreeNodeProps) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expanded.has(node.id);
  const badge = BADGE[node.type];
  const selected = node.id === selectedId;

  return (
    <div className="select-none">
      <div
        className={`flex cursor-pointer items-center gap-1 rounded-md py-1 pr-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
          selected
            ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950"
            : ""
        }`}
        style={{ paddingLeft: depth * 16 }}
        onClick={() => onSelect(node.id)}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(node.id);
            }}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="inline-block h-6 w-6 shrink-0" aria-hidden />
        )}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${badge.bg} ${badge.text}`}
        >
          {node.type}
        </span>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {node.name}
        </span>
      </div>

      {hasChildren ? (
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key={`${node.id}-children`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {node.children!.map((child) => (
                <TreeNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  expanded={expanded}
                  toggleExpanded={toggleExpanded}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}
    </div>
  );
}

export function TreeView({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: TreeViewProps) {
  const [expanded, setExpanded] = useState(() => buildInitiallyExpanded(nodes));

  useEffect(() => {
    setExpanded(buildInitiallyExpanded(nodes));
  }, [nodes]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="py-1" role="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={depth}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
