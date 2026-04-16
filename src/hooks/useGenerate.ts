"use client";

import type { OrchestrationEvent } from "@/lib/agents/AgentOrchestrator";
import type { ComponentTree } from "@/types/component-tree";
import { useCallback, useEffect, useState } from "react";

export type PrdHistoryItem = {
  prdText: string;
  pageTitle: string;
  componentCount: number;
  createdAt: string;
};

export type GenerateResult = {
  status: "idle" | "running" | "done" | "error";
  statusMessage: string;
  progress: number;
  componentTree: ComponentTree | null;
  generatedCodes: Record<string, string>;
  generationSummary: string;
  error: string | null;
  prdHistory: PrdHistoryItem[];
  generateFromPrd: (prdText: string) => Promise<void>;
  reset: () => void;
};

const initialState: Pick<
  GenerateResult,
  | "status"
  | "statusMessage"
  | "progress"
  | "componentTree"
  | "generatedCodes"
  | "generationSummary"
  | "error"
  | "prdHistory"
> = {
  status: "idle",
  statusMessage: "",
  progress: 0,
  componentTree: null,
  generatedCodes: {},
  generationSummary: "",
  error: null,
  prdHistory: [],
};

function parseSseBlocks(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts, rest };
}

function extractDataLines(block: string): string[] {
  const payloads: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("data: ")) {
      payloads.push(line.slice(6).trim());
    }
  }
  return payloads;
}

export function useGenerate(): GenerateResult {
  const [status, setStatus] = useState(initialState.status);
  const [statusMessage, setStatusMessage] = useState(initialState.statusMessage);
  const [progress, setProgress] = useState(initialState.progress);
  const [componentTree, setComponentTree] = useState(initialState.componentTree);
  const [generatedCodes, setGeneratedCodes] = useState(initialState.generatedCodes);
  const [generationSummary, setGenerationSummary] = useState(
    initialState.generationSummary,
  );
  const [error, setError] = useState(initialState.error);
  const [prdHistory, setPrdHistory] = useState(initialState.prdHistory);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/history");
        if (cancelled || !res.ok) {
          return;
        }
        const data: unknown = await res.json();
        if (cancelled) {
          return;
        }
        if (Array.isArray(data)) {
          setPrdHistory(data as PrdHistoryItem[]);
        } else if (
          data &&
          typeof data === "object" &&
          "history" in data &&
          Array.isArray((data as { history: unknown }).history)
        ) {
          setPrdHistory((data as { history: PrdHistoryItem[] }).history);
        }
      } catch {
        // Route not implemented yet — keep []
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyEvent = useCallback((event: OrchestrationEvent) => {
    switch (event.type) {
      case "status":
        setStatusMessage(event.message);
        setProgress(event.progress);
        break;
      case "tree_ready":
        setComponentTree(event.tree);
        break;
      case "component_ready":
        setGeneratedCodes((prev) => ({
          ...prev,
          [event.componentId]: event.code,
        }));
        break;
      case "done":
        setStatus("done");
        setStatusMessage("Complete!");
        break;
      case "summary_ready":
        setGenerationSummary(event.summary);
        break;
      case "error":
        setStatus("error");
        setError(event.message);
        break;
      default:
        break;
    }
  }, []);

  const generateFromPrd = useCallback(
    async (prdText: string) => {
      setStatus("running");
      setStatusMessage("");
      setProgress(0);
      setComponentTree(null);
      setGeneratedCodes({});
      setGenerationSummary("");
      setError(null);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prdText }),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => null);
          const msg =
            errJson &&
            typeof errJson === "object" &&
            "error" in errJson &&
            typeof (errJson as { error: unknown }).error === "string"
              ? (errJson as { error: string }).error
              : `Request failed (${response.status})`;
          setStatus("error");
          setError(msg);
          return;
        }

        const body = response.body;
        if (!body) {
          setStatus("error");
          setError("No response body");
          return;
        }

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseBlocks(buffer);
          buffer = rest;

          for (const block of events) {
            for (const payload of extractDataLines(block)) {
              if (!payload) {
                continue;
              }
              try {
                const event = JSON.parse(payload) as OrchestrationEvent;
                applyEvent(event);
              } catch {
                // ignore malformed SSE payload
              }
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          const { events } = parseSseBlocks(buffer + "\n\n");
          for (const block of events) {
            for (const payload of extractDataLines(block)) {
              if (!payload) {
                continue;
              }
              try {
                const event = JSON.parse(payload) as OrchestrationEvent;
                applyEvent(event);
              } catch {
                // ignore
              }
            }
          }
        }
      } catch (e: unknown) {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [applyEvent],
  );

  const reset = useCallback(() => {
    setStatus(initialState.status);
    setStatusMessage(initialState.statusMessage);
    setProgress(initialState.progress);
    setComponentTree(initialState.componentTree);
    setGeneratedCodes(initialState.generatedCodes);
    setGenerationSummary(initialState.generationSummary);
    setError(initialState.error);
    setPrdHistory(initialState.prdHistory);
  }, []);

  return {
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
  };
}
