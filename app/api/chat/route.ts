// 채팅 API. 브라우저는 대화 기록(텍스트)만 보내고, 서버가 카드 프롬프트 + 도구로 Claude를 부른다.
// 응답은 NDJSON 스트림: {t:"iteration"} {t:"delta",text} {t:"tool",name} {t:"done",cards} {t:"error",code}
import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "@/lib/anthropic";
import { runChat, type ChatMessage } from "@/lib/chat";
import { errorCode, json, rateLimited } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TURNS = 40;
const MAX_USER_CHARS = 1500;
const MAX_ASSISTANT_CHARS = 8000;

function validate(body: unknown): ChatMessage[] | null {
  const msgs = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > MAX_TURNS) return null;
  for (const [i, m] of msgs.entries()) {
    if (typeof m?.content !== "string" || !m.content.trim()) return null;
    // user로 시작해 번갈아 오고 user로 끝나야 한다
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (m.role !== expected) return null;
    if (m.content.length > (m.role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS)) return null;
  }
  if (msgs.length % 2 === 0) return null;
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "no_api_key" });

  if (rateLimited(req, "chat", 20)) return json(429, { error: "too_many_requests" });

  const messages = validate(await req.json().catch(() => null));
  if (!messages) return json(400, { error: "bad_request" });

  const client = anthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const result = await runChat(client, messages, send);
        // 대화 내용은 기록하지 않고 사용량과 도구 판정 상태만 남긴다
        console.log(JSON.stringify({ usage: result.usage, tools: result.toolLog.map(({ output: _, ...t }) => t), unknown_cards: result.unknownCards }));
        send(result.refused ? { t: "error", code: "refusal" } : { t: "done", cards: result.cards });
      } catch (err) {
        console.error(err instanceof Anthropic.APIError ? `API ${err.status}` : err);
        send({ t: "error", code: errorCode(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
