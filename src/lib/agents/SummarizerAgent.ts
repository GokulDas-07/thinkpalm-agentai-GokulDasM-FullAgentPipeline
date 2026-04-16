import { streamCompletion, type Message } from "@/lib/groq-client";
import { getSystemPrompt } from "@/lib/prompts";
import { flattenTree, type ComponentTree } from "@/types/component-tree";
import { AgentMemory } from "./AgentMemory";

type LibrarySuggestions = {
  packages?: Array<{
    name?: string;
    description?: string;
    weeklyDownloads?: number;
    version?: string;
  }>;
  recommendation?: string;
  error?: string;
};

export class SummarizerAgent {
  constructor(private memory: AgentMemory) {}

  async run(
    tree: ComponentTree,
    generatedCodes: Record<string, string>,
  ): Promise<string> {
    const prdAnalysis = this.memory.get<unknown>("prd_analysis");
    const componentTree = this.memory.get<ComponentTree>("component_tree") ?? tree;
    const librarySuggestions =
      this.memory.get<LibrarySuggestions>("library_suggestions") ?? {};

    const components = flattenTree(componentTree.rootComponents);
    const componentCount = components.length;
    const typeCounts = {
      layout: 0,
      ui: 0,
      form: 0,
      data: 0,
    };
    for (const component of components) {
      if (component.type === "layout") {
        typeCounts.layout += 1;
      }
      if (component.type === "ui") {
        typeCounts.ui += 1;
      }
      if (component.type === "form") {
        typeCounts.form += 1;
      }
      if (component.type === "data") {
        typeCounts.data += 1;
      }
    }

    const allCode = Object.values(generatedCodes).join("\n");
    const ariaLabelMatches = allCode.match(/aria-label\s*=/gi) ?? [];
    const accessibilityScore = ariaLabelMatches.length;

    const prompt = [
      "You are a senior frontend architect.",
      "Create a concise, structured summary report for the generated UI system.",
      "Use markdown headings and bullet points.",
      "Include these sections in order:",
      "1) What was built",
      "2) Component breakdown by type",
      "3) Accessibility score",
      "4) Recommended next steps",
      "5) Recommended NPM packages",
      "",
      "Use this data:",
      `- Page title: ${componentTree.pageTitle}`,
      `- Component count: ${componentCount}`,
      `- Component type counts: ${JSON.stringify(typeCounts)}`,
      `- Accessibility score (aria-label count across all generated code): ${accessibilityScore}`,
      `- PRD analysis context: ${JSON.stringify(prdAnalysis ?? {})}`,
      `- Library suggestions: ${JSON.stringify(librarySuggestions)}`,
      "",
      "For package recommendations, list package name, purpose, weekly downloads, and version when available.",
      "Keep the report practical and actionable for a developer who will continue implementation.",
    ].join("\n");

    const messages: Message[] = [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: prompt },
    ];

    const summary = await streamCompletion(messages, () => {}, 0.3, 1200);
    this.memory.set("generation_summary", summary);
    return summary;
  }
}
