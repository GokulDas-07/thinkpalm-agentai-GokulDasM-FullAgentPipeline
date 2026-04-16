import type { Message } from "@/lib/groq-client";
import { flattenTree, type ComponentTree } from "@/types/component-tree";
import { agentMemory, type AgentMemory } from "./AgentMemory";
import { GeneratorAgent } from "./GeneratorAgent";
import { PlannerAgent } from "./PlannerAgent";
import { SummarizerAgent } from "./SummarizerAgent";

export type OrchestrationEvent =
  | { type: "status"; message: string; progress: number }
  | { type: "tree_ready"; tree: ComponentTree }
  | {
      type: "component_ready";
      componentId: string;
      componentName: string;
      code: string;
    }
  | {
      type: "done";
      summary: { componentCount: number; pageTitle: string };
    }
  | { type: "summary_ready"; summary: string }
  | { type: "error"; message: string };

export class AgentOrchestrator {
  private memory: AgentMemory = agentMemory;
  private planner = new PlannerAgent(this.memory);
  private generator = new GeneratorAgent(this.memory);
  private summarizer = new SummarizerAgent(this.memory);
  private sessionHistory: Message[] = [];

  async *run(prdText: string): AsyncGenerator<OrchestrationEvent> {
    this.memory.clear(true);
    this.sessionHistory = [];

    yield { type: "status", message: "Analyzing your PRD...", progress: 10 };

    let tree: ComponentTree;
    try {
      tree = await this.planner.run(prdText, this.sessionHistory);
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }

    this.sessionHistory.push({
      role: "assistant",
      content: "I have analyzed the PRD and planned the component tree.",
    });

    const allComponents = flattenTree(tree.rootComponents);
    const total = allComponents.length;

    yield {
      type: "status",
      message: `Planning complete. Found ${total} components.`,
      progress: 30,
    };
    yield { type: "tree_ready", tree };

    let index = 0;
    const generatedCodes: Record<string, string> = {};
    try {
      for await (const result of this.generator.run(
        tree,
        this.sessionHistory,
        (name, i, t) => {
          this.memory.set("gen_progress", {
            current: i,
            total: t,
            name,
          });
        },
      )) {
        const progress =
          30 + Math.round((index / Math.max(total, 1)) * 65);
        yield {
          type: "status",
          message: `Generated ${result.componentName} (${index + 1}/${total})`,
          progress,
        };
        generatedCodes[result.componentId] = result.code;
        yield { type: "component_ready", ...result };
        index += 1;
      }
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
      return;
    }

    this.memory.addToPrdHistory({
      prdText: prdText.slice(0, 200),
      pageTitle: tree.pageTitle,
      componentCount: allComponents.length,
      createdAt: new Date().toISOString(),
    });

    yield {
      type: "done",
      summary: {
        componentCount: allComponents.length,
        pageTitle: tree.pageTitle,
      },
    };

    try {
      const summary = await this.summarizer.run(tree, generatedCodes);
      yield { type: "summary_ready", summary };
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  getPrdHistory() {
    return this.memory.getPrdHistory();
  }

  resetSession() {
    this.sessionHistory = [];
    this.memory.clear(true);
  }
}
