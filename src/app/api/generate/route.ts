import { AgentOrchestrator } from "@/lib/agents/AgentOrchestrator";
import { NextRequest } from "next/server";

const rateLimitMap = new Map<string, number[]>();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = rateLimitMap.get(ip) ?? [];
  const filtered = prev.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (filtered.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, filtered);
    return true;
  }
  filtered.push(now);
  rateLimitMap.set(ip, filtered);
  return false;
}

export async function POST(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prdText =
    body &&
    typeof body === "object" &&
    "prdText" in body &&
    typeof (body as { prdText: unknown }).prdText === "string"
      ? (body as { prdText: string }).prdText
      : undefined;

  if (!prdText || prdText.length <= 50) {
    return Response.json(
      { error: "prdText is required and must be longer than 50 characters" },
      { status: 400 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      try {
        const orchestrator = new AgentOrchestrator();
        for await (const event of orchestrator.run(prdText)) {
          send(event);
        }
      } catch (e: unknown) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
