// 답변 한 번 만들기: 카드 프롬프트 + 규칙 도구로 Claude를 부른다. 채팅 API와 평가 스크립트가 같이 쓴다.
import type Anthropic from "@anthropic-ai/sdk";
import { getCard } from "@/lib/kb";
import { parseAnswer } from "@/lib/answer";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { makeTools, type ToolLog } from "@/lib/tools";

export const MODEL = "claude-opus-5-5";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatEvent =
  | { t: "iteration" }
  | { t: "delta"; text: string }
  | { t: "tool"; name: string };

export interface Usage {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export interface ChatResult {
  /** 최종 답 원문 (<vi><ko><cards> 형식) */
  text: string;
  /** 답에 적힌 카드 ID 중 실제로 있는 것 */
  cards: string[];
  unknownCards: string[];
  refused: boolean;
  toolLog: ToolLog;
  usage: Usage[];
}

export async function runChat(
  client: Anthropic,
  messages: ChatMessage[],
  onEvent: (e: ChatEvent) => void = () => {},
): Promise<ChatResult> {
  const toolLog: ToolLog = [];
  const usage: Usage[] = [];
  let text = "";

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
    // 도구를 부른 뒤 새 응답이 시작되면 글을 새로 쓴다 (최종 답만 남긴다)
    onEvent({ t: "iteration" });
    text = "";
    for await (const event of messageStream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onEvent({ t: "delta", text: event.delta.text });
      } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        onEvent({ t: "tool", name: event.content_block.name });
      }
    }
    const message = await messageStream.finalMessage();
    const u = message.usage;
    usage.push({
      input: u.input_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      output: u.output_tokens,
    });
    if (message.stop_reason === "refusal") {
      return { text: "", cards: [], unknownCards: [], refused: true, toolLog, usage };
    }
    const hasToolUse = message.content.some((b) => b.type === "tool_use");
    if (message.stop_reason === "max_tokens" && hasToolUse) {
      throw new Error("tool input truncated at max_tokens");
    }
  }

  const cited = parseAnswer(text).cards;
  return {
    text,
    cards: cited.filter((id) => getCard(id)),
    unknownCards: cited.filter((id) => !getCard(id)),
    refused: false,
    toolLog,
    usage,
  };
}
