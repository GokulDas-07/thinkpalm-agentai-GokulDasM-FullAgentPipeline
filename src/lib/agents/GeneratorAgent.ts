import groq, {
  completionWithTools,
  streamCompletion,
  type Message,
} from "@/lib/groq-client";
import { getComponentCodePrompt, getSystemPrompt } from "@/lib/prompts";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import {
  flattenTree,
  type ComponentNode,
  type ComponentTree,
} from "@/types/component-tree";
import { AgentMemory } from "./AgentMemory";

void groq;

export const GENERATOR_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "validate_tsx_syntax",
      description: "Checks if TSX code has basic structural validity",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string" },
          componentName: { type: "string" },
        },
        required: ["code", "componentName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_accessibility",
      description: "Checks if a component has basic accessibility attributes",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string" },
        },
        required: ["code"],
      },
    },
  },
];

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^```(?:tsx|ts|jsx|js|javascript|typescript)?\s*([\s\S]*?)\s*```$/i,
  );
  return match ? match[1].trim() : trimmed;
}

function buildSiblingContext(components: ComponentNode[]): string {
  return components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
}

export class GeneratorAgent {
  constructor(private memory: AgentMemory) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private executeTool(name: string, args: any): any {
    if (name === "validate_tsx_syntax") {
      const code = String(args?.code ?? "");
      const componentName = String(args?.componentName ?? "");
      const issues: string[] = [];
      if (!code.includes("export")) {
        issues.push("Missing `export` keyword (expected a named export).");
      }
      if (componentName && !code.includes(componentName)) {
        issues.push(
          `Component name "${componentName}" not found in source (check export / identifier spelling).`,
        );
      }
      if (!code.includes("return")) {
        issues.push("Missing `return` statement in the component body.");
      }
      return { valid: issues.length === 0, issues };
    }
    if (name === "check_accessibility") {
      const code = String(args?.code ?? "");
      const hasAria = /aria-[a-zA-Z][\w-]*/i.test(code);
      const hasRole = /\brole\s*=\s*["'{]/i.test(code);
      const hasAlt = /\balt\s*=\s*["'{]/i.test(code);
      const hasAriaLabels = hasAria || hasRole || hasAlt;
      const suggestions: string[] = [];
      if (!hasAria) {
        suggestions.push("No `aria-*` attributes found; add aria-label or similar where controls lack visible text.");
      }
      if (!hasRole) {
        suggestions.push("No `role=` attribute found; use semantic elements or explicit roles for custom widgets.");
      }
      if (!hasAlt && /<img\b/i.test(code)) {
        suggestions.push("`<img>` is missing `alt=`; provide descriptive alternative text.");
      }
      return { hasAriaLabels, suggestions };
    }
    return { error: "Unknown tool" };
  }

  private async runCompletionWithToolLoop(
    messages: ChatCompletionMessageParam[],
  ): Promise<{ content: string; toolIssueHints: string[] }> {
    const MAX_ITERATIONS = 5;
    let iteration = 0;
    const toolIssueHints: string[] = [];
    let finalContent = "";

    while (iteration < MAX_ITERATIONS) {
      iteration += 1;
      const response = await completionWithTools(
        messages as unknown as Message[],
        GENERATOR_TOOLS,
      );
      const content = response.content ?? "";
      const toolCalls = response.toolCalls ?? [];
      messages.push({
        role: "assistant",
        content,
        tool_calls: toolCalls,
      });

      if (!toolCalls.length) {
        finalContent = content;
        break;
      }

      for (const tc of toolCalls) {
        const fn = tc.function;
        const toolName = fn?.name ?? "";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn?.arguments ?? "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = this.executeTool(toolName, args);
        this.memory.set(`tool_result_${toolName}`, result);
        if (toolName === "validate_tsx_syntax") {
          const syntaxResult = result as { valid?: boolean; issues?: string[] };
          if (!syntaxResult.valid && syntaxResult.issues?.length) {
            toolIssueHints.push(...syntaxResult.issues);
          }
        }
        if (toolName === "check_accessibility") {
          const a11yResult = result as { suggestions?: string[] };
          if (a11yResult.suggestions?.length) {
            toolIssueHints.push(...a11yResult.suggestions);
          }
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return { content: finalContent, toolIssueHints };
  }

  async *run(
    tree: ComponentTree,
    sessionHistory: Message[],
    onProgress: (componentName: string, index: number, total: number) => void,
  ): AsyncGenerator<{
    componentId: string;
    componentName: string;
    code: string;
  }> {
    const components = flattenTree(tree.rootComponents);
    const siblingContext = buildSiblingContext(components);
    const total = components.length;

    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      onProgress(component.name, index, total);

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: getSystemPrompt() },
        ...(sessionHistory as ChatCompletionMessageParam[]),
        {
          role: "user",
          content: getComponentCodePrompt(
            JSON.stringify(component),
            siblingContext,
          ),
        },
      ];

      const { content, toolIssueHints } =
        await this.runCompletionWithToolLoop(messages);

      let finalCode = stripMarkdownFences(content);
      messages.push({ role: "assistant", content: finalCode });

      const syntax = this.executeTool("validate_tsx_syntax", {
        code: finalCode,
        componentName: component.name,
      }) as { valid: boolean; issues: string[] };
      const a11y = this.executeTool("check_accessibility", {
        code: finalCode,
      }) as { hasAriaLabels: boolean; suggestions: string[] };

      const fixList: string[] = [
        ...toolIssueHints,
        ...(syntax.valid ? [] : syntax.issues),
        ...a11y.suggestions,
      ];

      if (fixList.length > 0) {
        messages.push({
          role: "user",
          content: `Fix these issues:\n${fixList.join("\n")}`,
        });
        finalCode = stripMarkdownFences(
          await streamCompletion(messages as Message[], () => {}, 0.3, 4096),
        );
      }

      this.memory.set(`code_${component.id}`, finalCode);
      yield {
        componentId: component.id,
        componentName: component.name,
        code: finalCode,
      };
    }
  }
}
