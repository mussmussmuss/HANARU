// 결정적 규칙 함수. 숫자와 판정은 AI가 아니라 이 코드가 낸다.
// 모든 수치는 kb/cards.json 의 카드 원문(rule)에서 그대로 옮겼고, 결과에는 근거 카드 ID를 붙인다.
// 카드에 없는 경우는 추측하지 않고 status 로 알린다.
import universities from "@/kb/universities.json";

export type Status =
  | "ok" // 카드 기준으로 답할 수 있음
  | "need_info" // 조건이 빠져서 먼저 물어봐야 함 (missing 참고)
  | "not_eligible" // 카드 기준으로 해당 안 됨
  | "not_covered"; // 카드에 근거가 없음 → 학교·공관·1345 확인 안내

export interface RuleResult {
  status: Status;
  cardIds: string[];
  /** 되묻기 항목 (need_info 일 때) */
  missing?: string[];
  /** 카드 원문에서 가져온 사실 문장 (한국어). 답변은 이 문장 범위 안에서만 */
  facts: string[];
  /** 꼭 함께 알려야 하는 주의·확인 안내 */
  cautions: string[];
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const manwon = (n: number) => `${(n / 10000).toLocaleString("ko-KR")}만원`;

// ───────────────────────── 학교 등급 조회 (P23, P04) ─────────────────────────

export type DegreeGrade = "인증대학" | "비자정밀심사대학" | "명단에 없음";

export interface SchoolInfo {
  name: string;
  excellent: boolean; // 우수 인증대학
  degree: DegreeGrade; // 학위과정 등급
  language: DegreeGrade; // 어학연수과정 등급
}

export interface UniversityResult extends RuleResult {
  query: string;
  matches: SchoolInfo[];
  /** 정확히 일치하지 않을 때 비슷한 이름 (판정에 쓰지 않음) */
  suggestions?: string[];
}

const norm = (s: string) => s.replace(/[\s()·.\-]/g, "").toLowerCase();

const lists = {
  excellent: new Set(universities.excellent_certified),
  certDegree: new Set(universities.certified_degree),
  certLanguage: new Set(universities.certified_language),
  preciseDegree: new Set(universities.precise_review_degree),
  preciseLanguage: new Set(universities.precise_review_language),
};

const allSchools = [
  ...new Set([
    ...universities.excellent_certified,
    ...universities.certified_degree,
    ...universities.certified_language,
    ...universities.precise_review_degree,
    ...universities.precise_review_language,
  ]),
];

function classify(name: string): SchoolInfo {
  const grade = (cert: Set<string>, precise: Set<string>): DegreeGrade =>
    cert.has(name) ? "인증대학" : precise.has(name) ? "비자정밀심사대학" : "명단에 없음";
  return {
    name,
    excellent: lists.excellent.has(name),
    degree: grade(lists.certDegree, lists.preciseDegree),
    language: grade(lists.certLanguage, lists.preciseLanguage),
  };
}

/** 이름을 정식 명칭 후보로 늘린다. "성균관대" → "성균관대학교" */
function expand(key: string): string[] {
  const out = [key];
  if (key.endsWith("대")) out.push(`${key}학교`);
  if (key.endsWith("대학")) out.push(`${key}교`);
  return out;
}

/**
 * 학교 이름(한국어 정식 명칭 또는 "OO대" 줄임말)으로 2025년 인증 결과를 찾는다.
 * 분교·캠퍼스가 따로 있는 학교는 모두 돌려준다. 예: 건국대학교, 건국대학교(글로컬)
 */
export function lookupUniversity(name: string): UniversityResult {
  const key = norm(name);
  const keys = new Set(expand(key));
  const exact = allSchools.filter((s) => keys.has(norm(s)));
  // 같은 학교의 캠퍼스 명칭 ("건국대학교(글로컬)")
  const campuses = allSchools.filter(
    (s) => !exact.includes(s) && exact.some((e) => s.startsWith(`${e}(`)),
  );
  const matched = [...exact, ...campuses];

  const base = {
    query: name,
    cardIds: ["P23", "P04"],
    cautions: [
      `출처: ${universities.source}. 평가 결과의 적용 기간은 자료에 명시되지 않음`,
      "같은 대학이라도 학위과정과 어학연수과정의 등급이 다를 수 있음",
    ],
  };

  if (matched.length === 0) {
    const suggestions =
      key.length >= 2 ? allSchools.filter((s) => norm(s).includes(key)).slice(0, 5) : [];
    return {
      ...base,
      status: suggestions.length > 0 ? "need_info" : "ok",
      missing: suggestions.length > 0 ? ["학교 정식 명칭 (비슷한 이름이 여러 개)"] : undefined,
      matches: [],
      suggestions,
      facts:
        suggestions.length > 0
          ? []
          : [
              `'${name}'은(는) 2025년 인증대학·비자정밀심사대학 명단에서 찾지 못함`,
              "명단에 없는 학교는 '일반대학 또는 컨설팅대학'일 수 있음(컨설팅대 명단은 자료에 없음). 학교에 확인 필요",
            ],
    };
  }

  const matches = matched.map(classify);
  const facts = matches.map((m) => {
    const parts = [
      m.excellent ? "우수 인증대학" : null,
      `학위과정: ${m.degree}`,
      `어학연수과정: ${m.language}`,
    ].filter(Boolean);
    return `${m.name} — ${parts.join(", ")} (2025년 결과)`;
  });
  if (matches.some((m) => m.degree === "명단에 없음" || m.language === "명단에 없음")) {
    facts.push("'명단에 없음'인 과정은 일반대학 또는 컨설팅대학일 수 있음(컨설팅대 명단은 자료에 없음). 학교에 확인 필요");
  }
  if (matches.length > 1) {
    base.cautions.push("캠퍼스(분교)마다 등급이 다르므로 어느 캠퍼스인지 확인");
  }
  return { ...base, status: "ok", matches, facts };
}

// ───────────────────────── 시간제취업 허용 시간 (W02, W03, W04, W11) ─────────────────────────

export type Sejong = "초급" | "중급1" | "중급2" | "고급";
const SEJONG_ORDER: Sejong[] = ["초급", "중급1", "중급2", "고급"];

export interface KoreanScores {
  topik?: number; // TOPIK 급수
  kiipStage?: number; // 사회통합프로그램 이수 단계
  kiipPreTestScore?: number; // 사회통합프로그램 사전평가 점수
  sejong?: Sejong; // 세종학당 과정
}

export interface EnglishScores {
  toeflPbt?: number;
  toeflCbt?: number;
  toeflIbt?: number;
  ielts?: number;
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  teps?: number;
  newTeps?: number;
}

interface KoreanStandard {
  topik: number;
  kiipStage: number;
  kiipPreTestScore: number;
  sejong: Sejong;
  label: string;
}

// W03: 전문학사·학사 1~2학년
const KO_LOWER: KoreanStandard = {
  topik: 3, kiipStage: 3, kiipPreTestScore: 61, sejong: "중급1",
  label: "TOPIK 3급 / 사회통합프로그램 3단계 이수 또는 사전평가 61점 / 세종학당 중급1",
};
// W03: 학사 3~4학년, 석·박사
const KO_UPPER: KoreanStandard = {
  topik: 4, kiipStage: 4, kiipPreTestScore: 81, sejong: "중급2",
  label: "TOPIK 4급 / 사회통합프로그램 4단계 또는 81점 / 세종학당 중급2",
};
// W04: 어학연수
const KO_D4: KoreanStandard = {
  topik: 2, kiipStage: 2, kiipPreTestScore: 41, sejong: "초급",
  label: "TOPIK 2급 / 사회통합프로그램 2단계 이수 또는 사전평가 41점 / 세종학당 초급 이상",
};

function meetsKorean(k: KoreanScores, std: KoreanStandard): boolean {
  return (
    (k.topik ?? 0) >= std.topik ||
    (k.kiipStage ?? 0) >= std.kiipStage ||
    (k.kiipPreTestScore ?? 0) >= std.kiipPreTestScore ||
    (k.sejong !== undefined && SEJONG_ORDER.indexOf(k.sejong) >= SEJONG_ORDER.indexOf(std.sejong))
  );
}

// W03 영어트랙: TOEFL 530(CBT 197, iBT 71), IELTS 5.5, CEFR B2, TEPS 601(NEW TEPS 327)
function meetsEnglish(e: EnglishScores): boolean {
  const cefr = ["A1", "A2", "B1", "B2", "C1", "C2"];
  return (
    (e.toeflPbt ?? 0) >= 530 ||
    (e.toeflCbt ?? 0) >= 197 ||
    (e.toeflIbt ?? 0) >= 71 ||
    (e.ielts ?? 0) >= 5.5 ||
    (e.cefr !== undefined && cefr.indexOf(e.cefr) >= cefr.indexOf("B2")) ||
    (e.teps ?? 0) >= 601 ||
    (e.newTeps ?? 0) >= 327
  );
}

export type StayType =
  | "D-2-1" | "D-2-2" | "D-2-3" | "D-2-4" | "D-2-5" | "D-2-6" | "D-2-7" | "D-2-8"
  | "D-4-1" | "D-4-7" | "D-10-1";

export interface PartTimeInput {
  stay: StayType;
  /** 학사(D-2-2) 학년 1~4 */
  year?: number;
  /** 한국어 성적. 모르면 생략(→ 되묻기), 성적이 없으면 빈 객체 {} */
  korean?: KoreanScores;
  /** 영어트랙 재학생만: 영어 성적 */
  englishTrack?: EnglishScores;
  /** 인증대학·성적우수·한국어우수 중 하나에 해당하는지. 모르면 생략(→ 두 경우 모두 안내) */
  certifiedOrExcellent?: boolean;
  /** D-4, D-2-8: 자격 변경일(사증 소지자는 입국일)로부터 지난 개월 수 */
  monthsSinceEntry?: number;
}

export interface PartTimeResult extends RuleResult {
  hours?: {
    /** 주중·주말·방학을 모두 합한 주당 한도 */
    weeklyTotal?: number;
    /** 주중 한도 (주말·방학은 weekendVacation) */
    weekday?: number;
    weekendVacation?: "제한 없음" | "주당 한도에 포함";
    /** 인증대학 등에 해당할 때의 한도 (certifiedOrExcellent 를 모를 때 함께 안내) */
    ifCertifiedOrExcellent?: number;
  };
}

const COMMON_PT_CAUTIONS = [
  "아르바이트 전에 반드시 시간제취업 허가를 받아야 함. 허가 없이 일하면 학생과 고용주 모두 처벌될 수 있음 (W01)",
];

export function partTimeHours(input: PartTimeInput): PartTimeResult {
  const { stay } = input;

  if (stay === "D-10-1") return d10Hours(input);
  if (stay === "D-4-1" || stay === "D-4-7") return d4Hours(input);

  if (stay === "D-2-5") {
    return {
      status: "not_eligible",
      cardIds: ["W02"],
      facts: ["D-2-5 연구과정은 시간제취업 대상 목록에 없음 (연구 활동은 W09 참고)"],
      cautions: [],
    };
  }

  if (stay === "D-2-6" || stay === "D-2-7" || stay === "D-2-8") {
    const facts =
      stay === "D-2-8"
        ? ["D-2-8 방문학생은 자격 변경일(사증 소지자는 입국일)로부터 6개월이 지난 후 시간제취업 신청 가능"]
        : [`${stay}는 바로 시간제취업 신청 가능 (한국어 능력 보유, 대학 유학생 담당자 확인)`];
    if (stay === "D-2-8" && input.monthsSinceEntry !== undefined && input.monthsSinceEntry < 6) {
      return { status: "not_eligible", cardIds: ["W02"], facts, cautions: COMMON_PT_CAUTIONS };
    }
    return {
      status: "not_covered",
      cardIds: ["W02", "W03"],
      facts,
      cautions: [
        `${stay}의 주당 허용 시간은 규정 카드의 시간표(전문학사·학사·석박사)에 따로 나와 있지 않음. 학교 유학생 담당자 또는 1345에 확인`,
        ...COMMON_PT_CAUTIONS,
      ],
    };
  }

  // 학위과정: D-2-1 전문학사, D-2-2 학사, D-2-3 석사, D-2-4 박사
  const graduate = stay === "D-2-3" || stay === "D-2-4";
  const englishMet = input.englishTrack !== undefined && meetsEnglish(input.englishTrack);
  const missing: string[] = [];
  if (!englishMet) {
    if (stay === "D-2-2" && input.year === undefined) missing.push("학년(1~4)");
    if (input.korean === undefined) missing.push("한국어 성적(TOPIK/사회통합프로그램/세종학당)");
  }
  if (missing.length > 0) {
    return { status: "need_info", cardIds: ["W03"], missing, facts: [], cautions: [] };
  }

  const std = stay === "D-2-1" || (stay === "D-2-2" && (input.year ?? 0) <= 2) ? KO_LOWER : KO_UPPER;
  const met = englishMet || meetsKorean(input.korean!, std);

  const course = stay === "D-2-1" ? "전문학사" : stay === "D-2-2" ? `학사 ${input.year ?? ""}학년`.trim() : "석·박사";
  const facts: string[] = englishMet
    ? ["영어트랙 기준(학년 관계없이 TOEFL 530(CBT 197, iBT 71), IELTS 5.5, CEFR B2, TEPS 601(NEW TEPS 327) 이상) 충족"]
    : [`${course}의 한국어 기준: ${std.label}`];

  if (!met) {
    const weekly = graduate ? 15 : 10;
    facts.push(
      graduate
        ? `기준 미충족: 주당 ${weekly}시간`
        : `기준 미충족: 주당 ${weekly}시간 (주말·방학 포함)`,
    );
    return {
      status: "ok",
      cardIds: ["W02", "W03"],
      hours: { weeklyTotal: weekly, weekendVacation: graduate ? undefined : "주당 한도에 포함" },
      facts,
      cautions: COMMON_PT_CAUTIONS,
    };
  }

  const weekday = graduate ? 30 : 25;
  const certified = graduate ? 35 : 30;
  facts.push(`기준 충족: 주중 ${weekday}시간, 주말·방학은 시간 제한 없음`);
  const hours: PartTimeResult["hours"] = { weekday, weekendVacation: "제한 없음" };
  if (input.certifiedOrExcellent === true) {
    hours.weekday = certified;
    facts.push(`인증대학·성적우수·한국어우수에 해당: 주중 ${certified}시간`);
  } else if (input.certifiedOrExcellent === undefined) {
    hours.ifCertifiedOrExcellent = certified;
    facts.push(`인증대학·성적우수·한국어우수에 해당하면 주중 ${certified}시간`);
  }
  return { status: "ok", cardIds: ["W02", "W03"], hours, facts, cautions: COMMON_PT_CAUTIONS };
}

function d4Hours(input: PartTimeInput): PartTimeResult {
  const cardIds = ["W02", "W04"];
  const sixMonths =
    "어학연수(D-4-1, D-4-7)는 자격 변경일(사증 소지자는 입국일)로부터 6개월이 지난 후 시간제취업 신청 가능";
  const d4Cautions = [
    "어학연수 시간표는 법무부 외국인체류 안내매뉴얼 본문에 없고 Study in Korea(국립국제교육원) 표만 근거. 1345에 확인 권장",
    "어학연수생 허가는 체류기간 내 최장 6개월, 1곳 (W07)",
    ...COMMON_PT_CAUTIONS,
  ];

  const missing: string[] = [];
  if (input.monthsSinceEntry === undefined) missing.push("입국(또는 D-4 변경) 후 지난 기간");
  if (input.monthsSinceEntry !== undefined && input.monthsSinceEntry < 6) {
    return {
      status: "not_eligible",
      cardIds,
      facts: [sixMonths, `지금은 ${input.monthsSinceEntry}개월이라 아직 신청할 수 없음`],
      cautions: COMMON_PT_CAUTIONS,
    };
  }
  if (input.korean === undefined) missing.push("한국어 성적(TOPIK/사회통합프로그램/세종학당)");
  if (missing.length > 0) {
    return { status: "need_info", cardIds, missing, facts: [sixMonths], cautions: [] };
  }

  const met = meetsKorean(input.korean!, KO_D4);
  const facts = [sixMonths, `어학연수 한국어 기준: ${KO_D4.label}`];
  const hours: PartTimeResult["hours"] = { weekendVacation: "주당 한도에 포함" };
  if (!met) {
    hours.weeklyTotal = 10;
    facts.push("기준 미충족: 주당 10시간 (주중·주말·방학 합산). 인증대학 등도 10시간");
  } else {
    const certified = 25;
    hours.weeklyTotal = input.certifiedOrExcellent === true ? certified : 20;
    facts.push("기준 충족: 주당 20시간 (주중·주말·방학 합산)");
    if (input.certifiedOrExcellent === true) facts.push(`인증대학 등에 해당: 주당 ${certified}시간`);
    else if (input.certifiedOrExcellent === undefined) {
      hours.ifCertifiedOrExcellent = certified;
      facts.push(`인증대학 등에 해당하면 주당 ${certified}시간`);
    }
  }
  return { status: "ok", cardIds, hours, facts, cautions: d4Cautions };
}

function d10Hours(input: PartTimeInput): PartTimeResult {
  const cardIds = ["W11"];
  const requirement =
    "대상: 일반구직(D-10-1) 소지자로 국내 대학 전문학사 이상 학위, 졸업일로부터 3년 미만, 사회통합프로그램 4단계 이상 이수 또는 TOPIK 4급 이상, E-1~E-7 체류 이력 없음";
  const cautions = ["체류자격외 활동허가로 처리, 수수료 12만원", ...COMMON_PT_CAUTIONS];
  const k = input.korean;
  if (k === undefined) {
    return {
      status: "need_info",
      cardIds,
      missing: ["한국어 성적(TOPIK 또는 사회통합프로그램 단계)"],
      facts: [requirement],
      cautions,
    };
  }
  if ((k.topik ?? 0) < 4 && (k.kiipStage ?? 0) < 4) {
    return {
      status: "not_eligible",
      cardIds,
      facts: [requirement, "한국어 요건(사회통합프로그램 4단계 이상 또는 TOPIK 4급 이상)을 충족하지 않음"],
      cautions,
    };
  }
  const weekday = (k.kiipStage ?? 0) >= 5 ? 30 : 25;
  const facts = [requirement, "허용 시간: 주중 25시간, 주말·공휴일 제한 없음. 사회통합프로그램 5단계 이상은 주중 30시간"];
  return {
    status: "ok",
    cardIds,
    hours: { weekday, weekendVacation: "제한 없음" },
    facts,
    cautions: [...cautions, "졸업일로부터 3년 미만, E-1~E-7 체류 이력 없음 요건도 충족해야 함"],
  };
}

// ───────────────────────── 재정 증명 금액 (P11, P12, P13) ─────────────────────────

export type Region = "수도권" | "지방";
export type Consulate = "하노이" | "호치민" | "다낭";

// P13: 교환·방문학생 월 기준금액 (2025년 주거급여 선정기준 1인 가구)
export const MONTHLY_STAY_COST: Record<Consulate, number> = {
  호치민: 1_148_166,
  하노이: 1_069_654,
  다낭: 1_069_654,
};

export interface FinanceInput {
  stay: StayType;
  /** 학교 소재지 */
  region?: Region;
  /** 신청 공관. 모르면 생략 */
  consulate?: Consulate;
  /** 교환·방문학생 체류 개월 수 */
  months?: number;
}

export interface FinanceResult extends RuleResult {
  /** 학위과정·어학연수: 최소 잔고(원) */
  minBalance?: number;
  /** 최소 예치 기간(개월). null = 예치기간 요건 없음 */
  minMonthsDeposited?: number | null;
  /** 교환·방문학생: 공관별 체재비 */
  byConsulate?: { consulate: Consulate; monthly: number; months: number; total: number; plusTuition: boolean }[];
}

const COMMON_FIN_CAUTIONS = [
  "계좌잔고증명서는 본인 명의, 부모 재정보증 원칙 (P11)",
  "베트남 동화 잔고증명서는 사증 신청일 기준 환율로 계산. 양도한 통장은 인정되지 않으며 적발 시 불허 (P11)",
  "잔고증명서는 접수일 기준 10일 이내 발급한 것만 유효 (P10)",
];

export function financeRequirement(input: FinanceInput): FinanceResult {
  const { stay } = input;

  if (["D-2-1", "D-2-2", "D-2-3", "D-2-4", "D-2-5"].includes(stay)) {
    if (!input.region) {
      return { status: "need_info", cardIds: ["P11"], missing: ["학교 소재지(수도권/지방)"], facts: [], cautions: [] };
    }
    const minBalance = input.region === "수도권" ? 20_000_000 : 16_000_000;
    const noPeriod = stay === "D-2-4" || stay === "D-2-5";
    const facts = [
      `${input.region} 소재 대학 학위과정: 최소 ${manwon(minBalance)} 이상 잔고`,
      noPeriod
        ? `예외: D-2-4~D-2-8 유학생은 최소 예치기간(3개월)을 채울 필요 없음 (${stay} 해당)`
        : "최소 3개월 이상 예치",
    ];
    const cautions = [...COMMON_FIN_CAUTIONS];
    if (!noPeriod && (input.consulate === "하노이" || input.consulate === undefined)) {
      cautions.push("(하노이) 컨설팅 대학 유학생은 최소 6개월 이상 예치 필요 (P11)");
    }
    if (input.consulate === "다낭" || input.consulate === undefined) {
      cautions.push("(다낭) GKS장학생, 국비유학생, 재외동포, 우수인증대는 재정능력서류 면제 (P14)");
    }
    cautions.push(
      "TOPIK 4급 이상 재정 입증 면제는 2026.10.7 발표된 개편 '예정' 사항이며 현행이 아님. 지금은 현행 기준대로 준비 (R01)",
    );
    return {
      status: "ok",
      cardIds: ["P11", "P10", "P14", "R01"],
      minBalance,
      minMonthsDeposited: noPeriod ? null : 3,
      facts,
      cautions,
    };
  }

  if (stay === "D-4-1") {
    if (!input.region) {
      return { status: "need_info", cardIds: ["P12"], missing: ["학교 소재지(수도권/지방)"], facts: [], cautions: [] };
    }
    const minBalance = input.region === "수도권" ? 10_000_000 : 8_000_000;
    return {
      status: "ok",
      cardIds: ["P12", "P10", "P11"],
      minBalance,
      minMonthsDeposited: 6,
      facts: [
        `${input.region} 소재 대학 어학연수: 최소 ${manwon(minBalance)} 이상 잔고를 최소 6개월 이상 예치`,
        "어학연수(D-4)는 우수인증대인지 여부에 상관없이 학력요건 및 재정능력 입증서류 제출 필요",
      ],
      cautions: COMMON_FIN_CAUTIONS,
    };
  }

  if (stay === "D-2-6" || stay === "D-2-8") {
    if (input.months === undefined) {
      return { status: "need_info", cardIds: ["P13"], missing: ["체류 기간(개월)"], facts: [], cautions: [] };
    }
    const consulates: Consulate[] = input.consulate ? [input.consulate] : ["하노이", "호치민", "다낭"];
    const byConsulate = consulates.map((c) => ({
      consulate: c,
      monthly: MONTHLY_STAY_COST[c],
      months: input.months!,
      total: MONTHLY_STAY_COST[c] * input.months!,
      plusTuition: stay === "D-2-8" && c === "다낭",
    }));
    const facts = [
      "체류기간에 비례한 체재비 이상 잔고 예치: 월 기준금액 × 체류개월 수",
      ...byConsulate.map(
        (b) =>
          `(${b.consulate}) 월 ${won(b.monthly)} × ${b.months}개월 = ${won(b.total)}${b.plusTuition ? " + 등록금, 3개월 이상 예치" : ""}`,
      ),
    ];
    return {
      status: "ok",
      cardIds: ["P13", "M05", "P10"],
      byConsulate,
      facts,
      cautions: [
        "월 기준금액은 매년 갱신되는 「주거급여 선정기준」(국토교통부 고시)을 따르므로 최신 금액을 확인해야 함",
        ...(input.consulate ? [] : ["신청 공관을 아직 모르므로 공관별 금액을 각각 안내 (M05)"]),
        ...COMMON_FIN_CAUTIONS.slice(2),
      ],
    };
  }

  return {
    status: "not_covered",
    cardIds: ["P11", "P12", "P13"],
    facts: [],
    cautions: [`${stay}의 재정 증명 금액은 규정 카드에 없음. 신청 공관 또는 학교에 확인`],
  };
}
