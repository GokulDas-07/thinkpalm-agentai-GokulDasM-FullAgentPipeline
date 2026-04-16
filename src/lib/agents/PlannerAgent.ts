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
  {
    type: "function" as const,
    function: {
      name: "search_component_library",
      description:
        "Searches the NPM registry for relevant React component libraries based on the detected app type. Returns real package suggestions with download counts.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search term e.g. 'react form validation' or 'react data table'",
          },
          appType: { type: "string" },
        },
        required: ["query"],
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
  private async executeTool(name: string, args: any): Promise<any> {
    if (name === "validate_prd_quality") {
      const prdText = String(args?.prdText ?? "");
      const detectedAppType = String(args?.detectedAppType ?? "unknown");
      const wordCount = prdText.trim().split(/\s+/).filter(Boolean).length;
      const hasUserFlows = /user flow|journey|step|onboarding/i.test(prdText);
      const hasCoreScreens =
        /dashboard|settings|home|profile|checkout|table|chart|form/i.test(prdText);
      const hasDataNeeds = /api|data|source|integration|backend|auth/i.test(prdText);
      const warnings: string[] = [];

      if (prdText.length < 200) {
        warnings.push("PRD is very short, output may be generic.");
      }
      if (!hasUserFlows) {
        warnings.push("No clear user flow detected.");
      }
      if (!hasCoreScreens) {
        warnings.push("Core screens or modules are not explicitly described.");
      }
      if (!hasDataNeeds) {
        warnings.push("Data and integration requirements are not specified.");
      }

      const qualityScore = Math.max(
        0,
        Math.min(
          100,
          (prdText.length >= 200 ? 35 : 15) +
            (hasUserFlows ? 25 : 0) +
            (hasCoreScreens ? 25 : 0) +
            (hasDataNeeds ? 15 : 0),
        ),
      );

      return {
        isValid: qualityScore >= 55,
        qualityScore,
        detectedAppType,
        wordCount,
        checks: {
          hasSufficientLength: prdText.length > 100,
          hasUserFlows,
          hasCoreScreens,
          hasDataNeeds,
        },
        warnings,
        nextActions:
          warnings.length > 0
            ? [
                "Add explicit screen-level requirements.",
                "Describe primary user journeys and edge states.",
                "Include data dependencies and integration constraints.",
              ]
            : ["PRD quality looks sufficient for component planning."],
      };
    }
    if (name === "suggest_layout_pattern") {
      const appType = String(args?.appType ?? "other").toLowerCase();
      const pageCount = Number(args?.pageCount ?? 0);
      const pattern =
        LAYOUT_PATTERN_BY_APP_TYPE[appType] ?? LAYOUT_PATTERN_BY_APP_TYPE.other;
      const complexityTier =
        pageCount <= 2 ? "simple" : pageCount <= 6 ? "moderate" : "complex";
      return {
        appType,
        pageCount,
        complexityTier,
        suggestion: `${pattern} Given ${pageCount} page(s), keep shared navigation consistent and localize step-specific layouts only where needed.`,
        recommendedLayout: {
          navigation: pageCount > 1 ? "persistent sidebar or top nav" : "single-page header nav",
          contentDensity:
            appType === "dashboard" || appType === "ecommerce"
              ? "high-density cards/tables with filters"
              : "comfortable spacing with clear section hierarchy",
          responsiveStrategy:
            complexityTier === "complex"
              ? "mobile-first with progressive enhancement and collapsible panels"
              : "stack sections on mobile and preserve rhythm with shared spacing tokens",
        },
        implementationNotes: [
          "Standardize page templates for repeatable sections.",
          "Use a shared shell component to keep navigation consistent.",
          "Define breakpoints and spacing tokens up front.",
        ],
      };
    }
    if (name === "search_component_library") {
      try {
        const query = String(args?.query ?? "").trim();
        const appType = String(args?.appType ?? "unknown");
        const response = await fetch(
          `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}+react&size=3`,
        );
        if (!response.ok) {
          throw new Error(`NPM search failed with status ${response.status}`);
        }

        const results = (await response.json()) as {
          objects?: Array<{
            package?: {
              name?: string;
              description?: string;
              version?: string;
            };
            downloads?: {
              weekly?: number;
            };
          }>;
        };

        const output = {
          appType,
          query,
          packages: (results.objects ?? []).map((p) => ({
            name: p.package?.name,
            description: p.package?.description,
            weeklyDownloads: p.downloads?.weekly,
            version: p.package?.version,
          })),
          recommendation: `Consider using ${results.objects?.[0]?.package?.name} for this component type`,
        };

        this.memory.set("library_suggestions", output);
        return output;
      } catch {
        const fallback = {
          packages: [],
          error: "NPM registry unavailable, proceeding without suggestions",
        };
        this.memory.set("library_suggestions", fallback);
        return fallback;
      }
    }
    return { error: "Unknown tool" };
  }

  private async runCompletionWithToolLoop(
    initialMessages: ChatCompletionMessageParam[],
  ): Promise<string> {
    const MAX_ITERATIONS = 5;
    let iteration = 0;
    const messages: ChatCompletionMessageParam[] = [...initialMessages];
    let finalContent = "";

    while (iteration < MAX_ITERATIONS) {
      iteration += 1;
      const response = await completionWithTools(
        messages as unknown as Message[],
        PLANNER_TOOLS,
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
        const result = await this.executeTool(toolName, args);
        this.memory.set(`tool_result_${toolName}`, result);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return finalContent;
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
