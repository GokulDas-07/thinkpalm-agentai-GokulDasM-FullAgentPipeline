import Groq, { APIError } from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default groq;

export const MODEL = "llama-3.3-70b-versatile";

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
};

function throwGroqFailure(context: string, error: unknown): never {
  if (error instanceof APIError) {
    const body =
      error.error &&
      typeof error.error === "object" &&
      error.error !== null &&
      "message" in error.error
        ? String((error.error as { message: unknown }).message)
        : "";
    const status = error.status != null ? `HTTP ${error.status}` : "request failed";
    const parts = [error.message, body].filter(Boolean).join(" — ");
    throw new Error(`${context}: ${status}${parts ? ` — ${parts}` : ""}`);
  }
  if (error instanceof Error) {
    throw new Error(`${context}: ${error.message}`);
  }
  throw new Error(`${context}: ${String(error)}`);
}

function assertApiKey(context: string): void {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error(
      `${context}: GROQ_API_KEY is not set. Add it to your environment (e.g. .env.local) before calling Groq.`,
    );
  }
}

export async function streamCompletion(
  messages: Message[],
  onChunk: (text: string) => void,
  temperature = 0.3,
  maxTokens = 4096,
): Promise<string> {
  assertApiKey("streamCompletion");
  let fullText = "";
  try {
    const stream = await groq.chat.completions.create({
      model: MODEL,
      messages: messages as ChatCompletionMessageParam[],
      stream: true,
      temperature,
      max_tokens: maxTokens,
    });

    for await (const chunk of stream) {
      const piece = chunk.choices[0]?.delta?.content;
      if (piece) {
        onChunk(piece);
        fullText += piece;
      }
    }
  } catch (error) {
    throwGroqFailure("streamCompletion: Groq streaming chat completion failed", error);
  }
  return fullText;
}

// Tool schemas are caller-defined; `any[]` matches the Groq/OpenAI tools payload shape.
export async function completionWithTools(
  messages: Message[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API contract uses any[] per spec
  tools: any[],
  temperature = 0.2,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ content: string; toolCalls: any[] }> {
  assertApiKey("completionWithTools");
  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: messages as ChatCompletionMessageParam[],
      stream: false,
      tools,
      tool_choice: "auto",
      temperature,
    });

    const choice = response.choices[0];
    if (!choice?.message) {
      throw new Error(
        "completionWithTools: Groq returned no assistant message (empty choices).",
      );
    }

    const content = choice.message.content ?? "";
    const toolCalls = choice.message.tool_calls ?? [];

    return { content, toolCalls };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("completionWithTools: Groq returned")) {
      throw error;
    }
    throwGroqFailure("completionWithTools: Groq chat completion with tools failed", error);
  }
}
