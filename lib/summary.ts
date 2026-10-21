// 대화 요약: 지금까지의 대화(질문과 HANARU 답)만 보고 한두 페이지 요약을 만든다.
// 새 사실을 더하지 않도록, 요약에 나온 숫자가 대화에 있는지 코드로 한 번 더 확인한다.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { parseAnswer } from "@/lib/answer";
import { getCard } from "@/lib/kb";
import { MODEL, type ChatMessage, type Usage } from "@/lib/chat";

const Line = z.object({ vi: z.string(), ko: z.string() });

export const Summary = z.object({
  situation: z.array(Line).describe("학생이 대화에서 밝힌 자기 상황(과정, 학년, 학교 소재지, 신청 공관, 한국어 성적 등). 없으면 빈 배열"),
  topics: z
    .array(
      z.object({
        title: Line,
        points: z.array(Line),
        cards: z.array(z.string()).describe("이 주제의 근거 카드 ID (HANARU 답의 <cards>에 있던 것만)"),
      }),
    )
    .describe("질문 주제별로 HANARU가 안내한 내용"),
  todo: z.array(Line).describe("학생이 앞으로 준비하거나 해야 할 일 (대화에 나온 것만)"),
  open: z.array(Line).describe("아직 답이 정해지지 않은 것: HANARU가 되물었는데 학생이 답하지 않은 조건, 확인처에 확인하라고 한 것"),
});
export type Summary = z.infer<typeof Summary>;

const SYSTEM = `당신은 HANARU 대화 요약기다. HANARU는 베트남 유학생에게 한국 유학(D-2)·어학연수(D-4) 입국·비자·체류 절차를 안내하는 챗봇이다.
<대화>의 학생 질문과 HANARU 답만 보고, 학생이 나중에 다시 보거나 출력해 둘 요약을 만든다.

## 가장 중요한 원칙
1. 대화에 없는 내용은 한 글자도 더하지 않는다. 일반 상식, 기억, 추측으로 보충하지 않는다.
2. 빠짐없이: HANARU 답에 나온 사실은 모두 담는다. 숫자·금액·기간·기한·서류 이름·기관·조건·예외·공관별 차이·주의사항·"개편 예정(아직 시행 전)" 안내·확인처는 하나도 빠뜨리지 않는다.
3. 간략하게: 인사, 공감, 같은 내용의 반복, "더 알려줄까요?" 같은 말은 뺀다. 한 줄에 사실 하나, 짧은 문장으로 쓴다.
4. 숫자·금액·기간·서류 이름은 대화에 나온 표현 그대로 옮긴다. 계산하거나 반올림하거나 단위·표기를 바꾸지 않는다(예: 한국어는 "1,600만원", 베트남어는 대화의 베트남어 표기 그대로).
5. 조건이 붙은 내용은 조건과 함께 쓴다 (예: "수도권 대학이면 …", "(하노이) …"). 공관별로 다르면 공관별로 나눠 쓴다.
6. "개편 예정" 내용은 반드시 "2026.10.7 발표된 개편 예정, 아직 시행 전"임을 함께 쓴다. 현행처럼 쓰지 않는다.
7. HANARU가 "자료에 없다", "확인이 필요하다"고 한 것은 open에 확인처와 함께 쓴다.
8. 학생 이름, 여권번호, 연락처 같은 개인정보가 대화에 있어도 요약에 쓰지 않는다.
9. 같은 사실은 한 번만 쓴다. "최종 결정은 공관·출입국" 고지는 문서 아래에 따로 붙으므로 요약 어디에도 쓰지 않는다.

## 형식
- 각 줄은 베트남어(vi)와 한국어(ko) 두 가지로 쓰고, 두 언어의 내용·숫자는 같아야 한다. 베트남어는 학생을 "bạn"으로 부르는 쉬운 말, 한국어는 해요체가 아닌 짧은 메모체(~함, ~필요)로 쓴다.
- topics는 학생이 물어본 주제 순서대로. 같은 주제를 여러 번 물었으면 하나로 합치고, 나중 답이 앞의 답을 고쳤으면 나중 답을 따른다.
- 분량: A4 한 페이지가 목표. 대화가 길어 빠짐없이 담을 수 없으면 두 페이지까지 괜찮다. 분량을 맞추려고 사실을 빼지는 않는다.
- situation은 학생 상황을 한두 줄로 묶어 쓴다.
- todo는 "무엇을 언제까지 할지"만 짧게 쓴다. 금액·서류 목록 같은 세부는 topics에 있으므로 반복하지 않는다. 대화에 나온 할 일만, 없으면 빈 배열.
- open에는 아직 정해지지 않은 조건(HANARU가 되물었는데 답이 없는 것)과 "확인 필요"라고 한 것만 확인처와 함께 쓴다. topics에 이미 쓴 주의사항은 반복하지 않는다.`;

/** 대화를 요약기에 넘길 글로 바꾼다. 숫자 확인에도 쓰므로 HANARU 답의 두 언어를 모두 넣는다. */
export function transcript(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === "user") return `[학생] ${m.content}`;
      const a = parseAnswer(m.content);
      const body = a.raw ?? `${a.ko}\n(베트남어 답)\n${a.vi}`;
      return `[HANARU] ${body}${a.cards.length ? `\n(근거 카드: ${a.cards.join(", ")})` : ""}`;
    })
    .join("\n\n");
}

// 숫자 토큰: "2,000만원" → "2000", "1,069,654원" → "1069654", "2026.10.7" → "2026", "10", "7"
function numbers(text: string): string[] {
  return (text.match(/\d[\d,]*/g) ?? []).map((n) => n.replace(/,/g, "")).filter((n) => n.length > 0);
}

/** 요약에 나온 숫자 중 대화에 없는 것 (카드 ID의 숫자는 제외) */
export function unsupportedNumbers(summary: Summary, source: string): string[] {
  const known = new Set(numbers(source));
  const lines = [
    ...summary.situation,
    ...summary.topics.flatMap((t) => [t.title, ...t.points]),
    ...summary.todo,
    ...summary.open,
  ];
  const found = lines.flatMap((l) => [...numbers(l.vi), ...numbers(l.ko)]);
  return [...new Set(found.filter((n) => !known.has(n)))];
}

export interface SummaryResult {
  summary: Summary;
  usage: Usage[];
}

async function callOnce(client: Anthropic, source: string, feedback?: string) {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(Summary) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<대화>\n${source}\n</대화>${feedback ? `\n\n${feedback}` : ""}`,
      },
    ],
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const u = res.usage;
  const usage: Usage = {
    input: u.input_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens,
  };
  if (res.stop_reason === "refusal") return { refused: true as const, usage };
  if (!res.parsed_output) throw new Error(`summary returned no parsed output (stop: ${res.stop_reason})`);
  return { refused: false as const, summary: res.parsed_output, usage };
}

/**
 * 요약을 만든다. 대화에 없는 숫자가 나오면 한 번 다시 만들고, 그래도 있으면 실패로 본다.
 * 반환값 null 은 거절(refusal).
 */
export async function summarize(client: Anthropic, messages: ChatMessage[]): Promise<SummaryResult | null> {
  const source = transcript(messages);
  const usage: Usage[] = [];
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callOnce(client, source, feedback);
    usage.push(r.usage);
    if (r.refused) return null;
    const bad = unsupportedNumbers(r.summary, source);
    if (bad.length === 0) {
      // 근거 카드는 실제 있는 것만, M01(최종 결정 고지)은 문서 아래 고지로 대신한다
      const summary = { ...r.summary, topics: r.summary.topics.map((t) => ({ ...t, cards: t.cards.filter((id) => id !== "M01" && getCard(id)) })) };
      return { summary, usage };
    }
    feedback = `주의: 앞의 요약에 대화에 없는 숫자(${bad.join(", ")})가 있었다. 대화에 나온 숫자만 그대로 써서 다시 요약하라.`;
  }
  throw new Error("summary contained numbers not found in the conversation");
}
