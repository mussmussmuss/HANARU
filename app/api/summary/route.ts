// 대화 요약 API. 브라우저가 지금까지의 대화를 보내면 요약(JSON)을 돌려준다. 대화와 요약은 저장하지 않는다.
import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "@/lib/anthropic";
import type { ChatMessage } from "@/lib/chat";
import { errorCode, json, rateLimited } from "@/lib/guard";
import { summarize } from "@/lib/summary";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TURNS = 40;
const MAX_USER_CHARS = 1500;
const MAX_ASSISTANT_CHARS = 8000;

// user로 시작해 번갈아 오고, 답이 하나 이상 있어야 한다 (마지막은 HANARU 답)
function validate(body: unknown): ChatMessage[] | null {
  const msgs = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(msgs) || msgs.length < 2 || msgs.length > MAX_TURNS || msgs.length % 2 !== 0) return null;
  for (const [i, m] of msgs.entries()) {
    if (typeof m?.content !== "string" || !m.content.trim()) return null;
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (m.role !== expected) return null;
    if (m.content.length > (m.role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS)) return null;
  }
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "no_api_key" });
  if (rateLimited(req, "summary", 10)) return json(429, { error: "too_many_requests" });

  const messages = validate(await req.json().catch(() => null));
  if (!messages) return json(400, { error: "bad_request" });

  try {
    const result = await summarize(anthropicClient(), messages);
    console.log(JSON.stringify({ summary_usage: result?.usage ?? null }));
    if (!result) return json(200, { error: "refusal" });
    return json(200, { summary: result.summary });
  } catch (err) {
    console.error(err instanceof Anthropic.APIError ? `API ${err.status}` : err);
    return json(500, { error: errorCode(err) });
  }
}
