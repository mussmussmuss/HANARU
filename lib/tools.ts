// Claude가 부르는 도구. 실제 판정은 lib/rules.ts 의 결정적 함수가 한다.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { financeRequirement, lookupUniversity, partTimeHours, type RuleResult } from "@/lib/rules";

const STAY = z.enum([
  "D-2-1", "D-2-2", "D-2-3", "D-2-4", "D-2-5", "D-2-6", "D-2-7", "D-2-8",
  "D-4-1", "D-4-7", "D-10-1",
]);

const stayDescription =
  "체류자격 세부약호. D-2-1 전문학사, D-2-2 학사, D-2-3 석사, D-2-4 박사, D-2-5 연구과정, D-2-6 교환학생, D-2-7 일-학습연계, D-2-8 방문학생, D-4-1 한국어 연수, D-4-7 외국어 연수, D-10-1 졸업 후 구직";

/** 도구가 실행될 때마다 근거 카드를 기록한다 (로그·검증용) */
export type ToolLog = { name: string; status: RuleResult["status"]; cardIds: string[] }[];

export function makeTools(log: ToolLog) {
  const record = (name: string, r: RuleResult) => {
    log.push({ name, status: r.status, cardIds: r.cardIds });
    return JSON.stringify(r);
  };

  const lookup = betaZodTool({
    name: "lookup_university",
    description:
      "한국 대학의 2025년 교육국제화역량 인증 결과(우수 인증대학, 학위과정·어학연수과정별 인증대학/비자정밀심사대학)를 명단에서 조회한다. 학교 등급을 말할 때는 반드시 이 도구를 쓴다.",
    inputSchema: z.object({
      name: z.string().min(1).max(60).describe("학교의 한국어 이름. 정식 명칭(예: 성균관대학교) 또는 줄임말(예: 성균관대)"),
    }),
    eager_input_streaming: true,
    run: async ({ name }) => record("lookup_university", lookupUniversity(name)),
  });

  const korean = z
    .object({
      topik: z.number().int().min(1).max(6).optional().describe("TOPIK 급수"),
      kiipStage: z.number().int().min(0).max(5).optional().describe("사회통합프로그램(KIIP) 이수 단계"),
      kiipPreTestScore: z.number().int().min(0).max(100).optional().describe("사회통합프로그램 사전평가 점수"),
      sejong: z.enum(["초급", "중급1", "중급2", "고급"]).optional().describe("세종학당 과정"),
    })
    .optional()
    .describe("한국어 성적. 학생이 아직 말하지 않았으면 생략한다. 성적이 없다고 했으면 빈 객체 {}");

  const partTime = betaZodTool({
    name: "part_time_hours",
    description:
      "유학생(D-2)·어학연수생(D-4)·졸업 후 구직(D-10-1)의 시간제취업(아르바이트) 신청 가능 여부와 주당 허용 시간을 규정 카드 표로 계산한다. 아르바이트 시간을 말할 때는 반드시 이 도구를 쓴다. 학생이 말하지 않은 값은 넣지 말고 생략한다(추측 금지).",
    inputSchema: z.object({
      stay: STAY.describe(stayDescription),
      year: z.number().int().min(1).max(4).optional().describe("학사(D-2-2) 학년"),
      korean,
      englishTrack: z
        .object({
          toeflPbt: z.number().optional(),
          toeflCbt: z.number().optional(),
          toeflIbt: z.number().optional(),
          ielts: z.number().optional(),
          cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
          teps: z.number().optional(),
          newTeps: z.number().optional(),
        })
        .optional()
        .describe("영어트랙 재학생일 때만: 영어 성적"),
      certifiedOrExcellent: z
        .boolean()
        .optional()
        .describe("인증대학·성적우수·한국어우수 중 하나에 해당하는지. 확실하지 않으면 생략"),
      monthsSinceEntry: z
        .number()
        .min(0)
        .max(240)
        .optional()
        .describe("D-4, D-2-8: 자격 변경일(사증 소지자는 입국일)로부터 지난 개월 수"),
    }),
    eager_input_streaming: true,
    run: async (input) => record("part_time_hours", partTimeHours(input)),
  });

  const finance = betaZodTool({
    name: "finance_requirement",
    description:
      "비자 신청 시 재정 증명(잔고) 최소 금액과 예치 기간, 교환·방문학생의 공관별 체재비를 규정 카드 기준으로 계산한다. 재정 금액을 말할 때는 반드시 이 도구를 쓴다. 학생이 말하지 않은 값은 넣지 말고 생략한다(추측 금지).",
    inputSchema: z.object({
      stay: STAY.describe(stayDescription),
      region: z.enum(["수도권", "지방"]).optional().describe("학교 소재지"),
      consulate: z.enum(["하노이", "호치민", "다낭"]).optional().describe("비자를 신청할 공관. 모르면 생략"),
      months: z.number().int().min(1).max(60).optional().describe("교환·방문학생의 체류 개월 수"),
    }),
    eager_input_streaming: true,
    run: async (input) => record("finance_requirement", financeRequirement(input)),
  });

  return [lookup, partTime, finance];
}
