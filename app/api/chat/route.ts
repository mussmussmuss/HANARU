// 채팅 API. 브라우저는 대화 기록(텍스트)만 보내고, 서버가 카드 프롬프트 + 도구로 Claude를 부른다.
// 응답은 NDJSON 스트림: {t:"iteration"} {t:"delta",text} {t:"tool",name} {t:"done",cards} {t:"error",code}
import Anthropic from "@anthropic-ai/sdk";
import { getCard } from "@/lib/kb";
import { parseAnswer } from "@/lib/answer";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { makeTools, type ToolLog } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 40;
const MAX_USER_CHARS = 1500;
const MAX_ASSISTANT_CHARS = 8000;

// 데모 공개 링크용 간단한 요청 제한 (서버 인스턴스별, IP당 10분에 20회)
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

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

function json(status: number, body: object) {
  return Response.json(body, { status });
}

function errorCode(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "auth";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503)) return "overloaded";
  return "server";
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "no_api_key" });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return json(429, { error: "too_many_requests" });

  const messages = validate(await req.json().catch(() => null));
  if (!messages) return json(400, { error: "bad_request" });

  const client = new Anthropic();
  const toolLog: ToolLog = [];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      let finalText = "";
      try {
        const runner = client.beta.messages.toolRunner({
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: makeTools(toolLog),
          messages,
          max_iterations: 6,
          stream: true,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });

        for await (const messageStream of runner) {
          // 도구를 부른 뒤 새 응답이 시작되면 화면의 글을 새로 쓴다 (최종 답만 남긴다)
          send({ t: "iteration" });
          finalText = "";
          for await (const event of messageStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              finalText += event.delta.text;
              send({ t: "delta", text: event.delta.text });
            } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
              send({ t: "tool", name: event.content_block.name });
            }
          }
          const message = await messageStream.finalMessage();
          const u = message.usage;
          // 대화 내용은 기록하지 않고 사용량만 남긴다
          console.log(
            JSON.stringify({
              stop: message.stop_reason,
              in: u.input_tokens,
              cache_read: u.cache_read_input_tokens,
              cache_write: u.cache_creation_input_tokens,
              out: u.output_tokens,
            }),
          );
          if (message.stop_reason === "refusal") {
            send({ t: "error", code: "refusal" });
            controller.close();
            return;
          }
          const hasToolUse = message.content.some((b) => b.type === "tool_use");
          if (message.stop_reason === "max_tokens" && hasToolUse) {
            throw new Error("tool input truncated at max_tokens");
          }
        }

        // 근거 칩: 모델이 적은 카드 ID 중 실제로 있는 것만
        const cited = parseAnswer(finalText).cards;
        const cards = cited.filter((id) => getCard(id));
        if (cards.length !== cited.length) {
          console.warn(JSON.stringify({ unknown_cards: cited.filter((id) => !getCard(id)) }));
        }
        console.log(JSON.stringify({ tools: toolLog }));
        send({ t: "done", cards });
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
