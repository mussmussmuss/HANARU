// 평가 실행기: kb/eval.json 의 질문을 앱과 같은 방식(runChat)으로 답하게 하고, Claude Haiku 5.5가 채점한다.
// 실행: npm run eval -- [--only E03,E04] [--limit 5] [--lang vi|ko] [--concurrency 4]
// 결과: eval-results/<시각>.json, eval-results/<시각>.md
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import evalData from "@/kb/eval.json";
import { anthropicClient } from "@/lib/anthropic";
import { runChat, type ChatResult, type Usage } from "@/lib/chat";
import { parseAnswer } from "@/lib/answer";
import { cards } from "@/lib/kb";
import { cardText } from "@/lib/prompt";

interface EvalQ {
  id: string;
  type: string;
  q_ko: string;
  q_vi: string;
  profile: Record<string, unknown>;
  cards: string[];
  must: string[];
  must_not: string[];
  ask: string[];
}

const GRADER = "claude-haiku-5-5";

// 1M 토큰당 달러 (Claude Opus 5.5 / Claude Haiku 5.5, 프롬프트 100K 이하 요금)
const PRICE = {
  opus: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  haiku: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};

function cost(u: Usage[], p: (typeof PRICE)["opus"]): number {
  return u.reduce(
    (s, x) => s + (x.input * p.input + x.output * p.output + x.cacheWrite * p.cacheWrite + x.cacheRead * p.cacheRead) / 1e6,
    0,
  );
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const Grade = z.object({
  must: z.array(z.object({ item: z.string(), pass: z.boolean(), evidence: z.string() })),
  must_not: z.array(z.object({ item: z.string(), violated: z.boolean(), evidence: z.string() })),
  asked: z.array(z.object({ item: z.string(), asked: z.boolean() })),
  stated_number_before_asking: z.boolean(),
  unsupported_claims: z.array(z.object({ claim: z.string(), why: z.string() })),
  vi_ko_consistent: z.boolean(),
  comment: z.string(),
});
type Grade = z.infer<typeof Grade>;

const ALL_CARDS = cards.map(cardText).join("\n\n");

const GRADER_SYSTEM = `당신은 베트남 유학생용 비자 안내 챗봇의 답을 채점하는 엄격한 검수자다.
챗봇은 아래 <규정카드>에 있는 내용만 말해야 한다. 학생 질문, 채점 기준, 챗봇 답(베트남어·한국어)을 보고 판정한다.

- must: 각 항목이 답에 내용상 들어 있으면 pass=true. 표현이 달라도 뜻과 숫자가 같으면 통과. 숫자가 다르면 실패.
- must_not: 각 항목에 해당하는 말을 했으면 violated=true.
- asked: 각 되묻기 항목을 학생에게 물어봤으면 asked=true. 되묻기 항목이 없으면 빈 배열.
- stated_number_before_asking: 되묻기 항목이 있는 질문에서, 조건을 묻기 전에 특정 금액·시간을 단정했으면 true. 조건별 예시로 나눠 설명하며 묻는 것은 false.
- must, must_not, asked 배열에는 주어진 항목만 주어진 순서대로 넣는다. 다른 목록의 항목을 섞지 않는다.
- <도구결과>는 규정 카드 표와 2025년 인증대학 명단을 계산한 결과다. 답이 도구결과와 같으면 카드로 뒷받침되는 것으로 본다.
- unsupported_claims: 답 속 사실(숫자, 기간, 서류, 기관, 절차, 웹사이트 등) 중 <규정카드>나 <도구결과>로 뒷받침되지 않는 것. 인사·공감·되묻기 문장은 제외. 카드 내용을 쉽게 바꿔 말한 것은 지원되는 것으로 본다.
- vi_ko_consistent: 베트남어와 한국어 답의 내용·숫자가 같으면 true.
- evidence와 comment는 한국어로 짧게.

<규정카드>
${ALL_CARDS}
</규정카드>`;

async function grade(client: ReturnType<typeof anthropicClient>, q: EvalQ, answer: string, toolLog: ChatResult["toolLog"]) {
  const a = parseAnswer(answer);
  const res = await client.messages.parse({
    model: GRADER,
    max_tokens: 8000,
    system: [{ type: "text", text: GRADER_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `질문 유형: ${q.type}
학생 질문: ${q.q_vi} / ${q.q_ko}
근거 카드: ${q.cards.join(", ")}
must: ${JSON.stringify(q.must)}
must_not: ${JSON.stringify(q.must_not)}
되묻기 항목: ${JSON.stringify(q.ask)}

<도구결과>
${toolLog.map((t) => `${t.name}: ${t.output}`).join("\n") || "없음"}
</도구결과>

<챗봇답_베트남어>
${a.raw ?? a.vi}
</챗봇답_베트남어>
<챗봇답_한국어>
${a.ko}
</챗봇답_한국어>`,
      },
    ],
    output_config: { format: zodOutputFormat(Grade) },
  });
  const u = res.usage;
  const usage: Usage = {
    input: u.input_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens,
  };
  if (!res.parsed_output) throw new Error(`grader returned no parsed output (stop: ${res.stop_reason})`);
  return { grade: res.parsed_output, usage };
}

interface Row {
  q: EvalQ;
  chat?: ChatResult;
  grade?: Grade;
  error?: string;
  pass: boolean;
  formatOk: boolean;
  citedExpected: boolean;
  chatCost: number;
  gradeCost: number;
  ms: number;
}

// 채점기가 항목을 섞거나 덧붙여도 질문의 must 항목만 본다 (이름이 다르면 같은 순서의 항목)
function mustResults(q: EvalQ, g: Grade): Grade["must"] {
  return q.must.map((item, i) => g.must.find((m) => m.item === item) ?? g.must[i] ?? { item, pass: false, evidence: "채점 없음" });
}

function judge(q: EvalQ, g: Grade, formatOk: boolean): boolean {
  const mustOk = mustResults(q, g).every((m) => m.pass);
  const mustNotOk = g.must_not.every((m) => !m.violated);
  const askOk = q.ask.length === 0 || (g.asked.some((a) => a.asked) && !g.stated_number_before_asking);
  return formatOk && mustOk && mustNotOk && askOk;
}

async function runOne(client: ReturnType<typeof anthropicClient>, q: EvalQ, lang: "vi" | "ko"): Promise<Row> {
  const start = Date.now();
  const base = { q, pass: false, formatOk: false, citedExpected: false, chatCost: 0, gradeCost: 0 };
  try {
    const chat = await runChat(client, [{ role: "user", content: lang === "vi" ? q.q_vi : q.q_ko }]);
    const chatCost = cost(chat.usage, PRICE.opus);
    if (chat.refused) return { ...base, chat, chatCost, error: "refusal", ms: Date.now() - start };
    const a = parseAnswer(chat.text);
    const formatOk = a.raw === undefined && a.vi.length > 0 && a.ko.length > 0;
    const { grade: g, usage } = await grade(client, q, chat.text, chat.toolLog);
    return {
      q,
      chat,
      grade: g,
      pass: judge(q, g, formatOk),
      formatOk,
      citedExpected: q.cards.some((id) => chat.cards.includes(id)),
      chatCost,
      gradeCost: cost([usage], PRICE.haiku),
      ms: Date.now() - start,
    };
  } catch (err) {
    return { ...base, error: String(err), ms: Date.now() - start };
  }
}

function report(rows: Row[], lang: string, stamp: string): string {
  const passed = rows.filter((r) => r.pass).length;
  const violations = rows.flatMap((r) => (r.grade?.must_not ?? []).filter((m) => m.violated).map((m) => `${r.q.id}: ${m.item}`));
  const unsupported = rows.flatMap((r) => (r.grade?.unsupported_claims ?? []).map((c) => `${r.q.id}: ${c.claim} — ${c.why}`));
  const total = rows.reduce((s, r) => s + r.chatCost + r.gradeCost, 0);
  const L: string[] = [];
  L.push(`# 평가 결과 ${stamp}`, "");
  L.push(`- 질문 언어: ${lang}, 문항 ${rows.length}개`);
  L.push(`- 통과 ${passed} / ${rows.length}`);
  L.push(`- must_not 위반 ${violations.length}건`);
  L.push(`- 카드 근거 없는 주장(채점기 판단, 사람 확인 필요) ${unsupported.length}건`);
  L.push(`- 비용 약 $${total.toFixed(2)} (답변 $${rows.reduce((s, r) => s + r.chatCost, 0).toFixed(2)}, 채점 $${rows.reduce((s, r) => s + r.gradeCost, 0).toFixed(3)})`, "");
  L.push("| ID | 유형 | 결과 | 형식 | 근거카드 | 도구 | 비고 |", "|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const failed = [
      ...(r.grade ? mustResults(r.q, r.grade) : []).filter((m) => !m.pass).map((m) => `누락: ${m.item}`),
      ...(r.grade?.must_not ?? []).filter((m) => m.violated).map((m) => `위반: ${m.item}`),
      ...(r.q.ask.length && r.grade && !r.grade.asked.some((a) => a.asked) ? ["되묻기 안 함"] : []),
      ...(r.grade?.stated_number_before_asking ? ["묻기 전 숫자 단정"] : []),
      ...(r.error ? [`오류: ${r.error.slice(0, 80)}`] : []),
    ].join("; ");
    const tools = (r.chat?.toolLog ?? []).map((t) => `${t.name}:${t.status}`).join(" ");
    L.push(`| ${r.q.id} | ${r.q.type} | ${r.pass ? "통과" : "실패"} | ${r.formatOk ? "○" : "×"} | ${r.citedExpected ? "○" : "×"} ${r.chat?.cards.join(",") ?? ""} | ${tools} | ${failed.replace(/\|/g, "/")} |`);
  }
  if (unsupported.length) L.push("", "## 카드 근거 없는 주장 (사람 확인)", ...unsupported.map((u) => `- ${u}`));
  L.push("", "## 답변 원문");
  for (const r of rows) {
    const a = parseAnswer(r.chat?.text ?? "");
    L.push("", `### ${r.q.id} (${r.q.type}) ${r.pass ? "통과" : "실패"}`, `질문: ${lang === "vi" ? r.q.q_vi : r.q.q_ko}`, "", "```", a.raw ?? `${a.vi}\n---\n${a.ko}`, "```");
    if (r.grade?.comment) L.push(`채점 의견: ${r.grade.comment}`);
  }
  return L.join("\n") + "\n";
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY가 없습니다.");
    process.exit(1);
  }
  const lang = arg("lang") === "ko" ? "ko" : "vi";
  const only = arg("only")?.split(",");
  const limit = Number(arg("limit") ?? Infinity);
  const concurrency = Number(arg("concurrency") ?? 4);
  const qs = (evalData as EvalQ[]).filter((q) => !only || only.includes(q.id)).slice(0, limit);
  const client = anthropicClient();

  console.log(`문항 ${qs.length}개, 언어 ${lang}, 동시 ${concurrency}`);
  const rows: Row[] = new Array(qs.length);
  // 첫 문항으로 프롬프트 캐시를 만든 뒤 나머지를 동시에 돌린다
  let next = 0;
  const work = async () => {
    while (next < qs.length) {
      const i = next++;
      rows[i] = await runOne(client, qs[i], lang);
      const r = rows[i];
      console.log(`${r.q.id} ${r.pass ? "통과" : "실패"} $${(r.chatCost + r.gradeCost).toFixed(3)} ${(r.ms / 1000).toFixed(0)}s${r.error ? ` 오류: ${r.error.slice(0, 120)}` : ""}`);
    }
  };
  if (qs.length > 0) {
    next = 1;
    rows[0] = await runOne(client, qs[0], lang);
    console.log(`${rows[0].q.id} ${rows[0].pass ? "통과" : "실패"} $${(rows[0].chatCost + rows[0].gradeCost).toFixed(3)}${rows[0].error ? ` 오류: ${rows[0].error.slice(0, 120)}` : ""}`);
  }
  await Promise.all(Array.from({ length: concurrency }, work));

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const dir = path.join(process.cwd(), "eval-results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stamp}-${lang}.json`), JSON.stringify(rows, null, 1));
  const md = report(rows, lang, stamp);
  fs.writeFileSync(path.join(dir, `${stamp}-${lang}.md`), md);
  console.log(md.split("\n## 답변 원문")[0]);
  const cacheReads = rows.flatMap((r) => r.chat?.usage ?? []).reduce((s, u) => s + u.cacheRead, 0);
  console.log(`캐시 읽기 토큰 합계: ${cacheReads}`);
}

main();
