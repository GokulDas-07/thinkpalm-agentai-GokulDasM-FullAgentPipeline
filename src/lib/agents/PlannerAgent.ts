import groq, { MODEL, completionWithTools, type Message } from "@/lib/groq-client";
import {
  getComponentPlanPrompt,
  getPrdParsePrompt,
  getSystemPrompt,
} from "@/lib/prompts";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import {
  validateComponentTree,
  type ComponentTree,
} from "@/types/component-tree";
import { AgentMemory } from "./AgentMemory";

void groq;

export const PLANNER_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "validate_prd_quality",
      description:
        "Checks if the PRD has sufficient detail to generate a UI. Returns warnings if content is too vague.",
      parameters: {
        type: "object",
        properties: {
          prdText: { type: "string" },
          detectedAppType: { type: "string" },
        },
        required: ["prdText", "detectedAppType"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "suggest_layout_pattern",
      description:
        "Suggests a proven layout pattern based on the app type (dashboard, landing, ecommerce etc)",
      parameters: {
        type: "object",
        properties: {
          appType: { type: "string" },
          pageCount: { type: "number" },
        },
        required: ["appType", "pageCount"],
      },
    },
  },
];

const LAYOUT_PATTERN_BY_APP_TYPE: Record<string, string> = {
  dashboard:
    "Use a classic admin shell: collapsible sidebar navigation, sticky top bar with search and user menu, and a scrollable main content grid (cards + charts + tables).",
  landing:
    "Use a marketing landing structure: hero with primary CTA, social proof strip, feature grid, testimonial section, pricing teaser, FAQ accordion, and a closing CTA band with footer.",
  ecommerce:
    "Use a storefront layout: header with search and cart, promotional banner slot, category rail or tabs, product grid with filters sidebar on md+, trust badges, and sticky mini-cart summary on checkout steps.",
  saas:
    "Use a productized SaaS shell: primary sidebar for modules, in-page header with breadcrumbs and actions, settings as a nested sub-nav pattern, and consistent page max-width with responsive gutters.",
  onboarding:
    "Use a guided wizard: centered stepper header, single-column form panels with clear primary/secondary actions, progress saved between steps, and a concise confirmation summary on the final step.",
  other:
    "Use a neutral app shell: predictable header + main + footer, consistent 12-column responsive grid, and clear section spacing with a single primary action per viewport where possible.",
};

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseJsonFromModelContent(content: string): unknown {
  const cleaned = stripMarkdownFences(content);
  return JSON.parse(cleaned) as unknown;
}

export class PlannerAgent {
  constructor(private memory: AgentMemory) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private executeTool(name: string, args: any): any {
    if (name === "validate_prd_quality") {
      const prdText = String(args?.prdText ?? "");
      return {
        valid: prdText.length > 100,
        warnings:
          prdText.length < 200 ? ["PRD is very short, output may be generic"] : [],
      };
    }
    if (name === "suggest_layout_pattern") {
      const appType = String(args?.appType ?? "other").toLowerCase();
      const pageCount = Number(args?.pageCount ?? 0);
      const pattern =
        LAYOUT_PATTERN_BY_APP_TYPE[appType] ?? LAYOUT_PATTERN_BY_APP_TYPE.other;
      return {
        appType,
        pageCount,
        suggestion: `${pattern} Given ${pageCount} page(s), keep shared navigation consistent and localize step-specific layouts only where needed.`,
      };
    }
    return { error: "Unknown tool" };
  }

  private async runCompletionWithToolLoop(
    initialMessages: ChatCompletionMessageParam[],
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [...initialMessages];
    const maxRounds = 8;

    let { content, toolCalls } = await completionWithTools(
      messages as unknown as Message[],
      PLANNER_TOOLS,
    );

    for (let round = 0; round < maxRounds; round++) {
      if (!toolCalls?.length) {
        break;
      }

      messages.push({
        role: "assistant",
        content: content ?? "",
        tool_calls: toolCalls,
      });

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
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      const next = await completionWithTools(
        messages as unknown as Message[],
        PLANNER_TOOLS,
      );
      content = next.content;
      toolCalls = next.toolCalls;
    }

    return content ?? "";
  }

  async run(prdText: string, sessionHistory: Message[]): Promise<ComponentTree> {
    const parseMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: getSystemPrompt() },
      ...(sessionHistory as ChatCompletionMessageParam[]),
      { role: "user", content: getPrdParsePrompt(prdText) },
    ];

    const parseContent = await this.runCompletionWithToolLoop(parseMessages);

    let parsedPrd: unknown;
    try {
      parsedPrd = parseJsonFromModelContent(parseContent);
    } catch (e) {
      throw new Error(
        `PlannerAgent: failed to parse PRD analysis JSON from model (${MODEL}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    this.memory.set("prd_analysis", parsedPrd);

    const planMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: getSystemPrompt() },
      {
        role: "user",
        content: getComponentPlanPrompt(JSON.stringify(parsedPrd)),
      },
    ];

    const treeContent = await this.runCompletionWithToolLoop(planMessages);

    let treeJson: unknown;
    try {
      treeJson = parseJsonFromModelContent(treeContent);
    } catch (e) {
      throw new Error(
        `PlannerAgent: failed to parse component tree JSON from model (${MODEL}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const validated = validateComponentTree(treeJson);
    if (!validated.success || !validated.data) {
      throw new Error(
        validated.error ??
          "PlannerAgent: component tree failed schema validation.",
      );
    }

    this.memory.set("component_tree", validated.data);
    return validated.data;
  }
}
