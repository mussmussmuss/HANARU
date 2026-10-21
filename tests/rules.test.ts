// 규칙 함수가 카드 표와 일치하는지 확인한다. 괄호 안 E번호는 kb/eval.json 의 평가 질문.
import { describe, expect, it } from "vitest";
import cardsData from "@/kb/cards.json";
import universities from "@/kb/universities.json";
import { financeRequirement, lookupUniversity, partTimeHours } from "@/lib/rules";

const cardIds = new Set(cardsData.cards.map((c) => c.id));

describe("학교 등급 조회", () => {
  it("충북대학교: 학위과정 인증대학, 우수 인증대학 아님 (E14)", () => {
    const r = lookupUniversity("충북대학교");
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ excellent: false, degree: "인증대학" });
  });

  it("대구한의대: 학위과정 인증대학, 어학연수과정 비자정밀심사대학 (E15)", () => {
    const r = lookupUniversity("대구한의대");
    expect(r.matches[0]).toMatchObject({
      name: "대구한의대학교",
      degree: "인증대학",
      language: "비자정밀심사대학",
    });
  });

  it("성균관대: 우수 인증대학 (E17), 줄임말·띄어쓰기 허용", () => {
    expect(lookupUniversity("성균관대").matches[0].excellent).toBe(true);
    expect(lookupUniversity(" 성균관 대학교 ").matches[0].name).toBe("성균관대학교");
  });

  it("캠퍼스가 나뉜 학교는 모두 돌려주고 캠퍼스 확인을 안내", () => {
    const r = lookupUniversity("건국대");
    expect(r.matches.map((m) => m.name).sort()).toEqual(["건국대학교", "건국대학교(글로컬)"]);
    expect(r.cautions.join()).toContain("캠퍼스");
  });

  it("명단에 없는 학교는 등급을 지어내지 않음", () => {
    const r = lookupUniversity("하나루대학교");
    expect(r.matches).toHaveLength(0);
    expect(r.facts.join()).toContain("일반대학 또는 컨설팅대학");
  });

  it("이름 일부만 맞으면 판정하지 않고 후보만 제시", () => {
    const r = lookupUniversity("부산");
    expect(r.status).toBe("need_info");
    expect(r.matches).toHaveLength(0);
    expect(r.suggestions!.length).toBeGreaterThan(0);
  });

  it("명단 수가 자료와 같음", () => {
    expect(universities.excellent_certified).toHaveLength(43);
    expect(universities.certified_degree).toHaveLength(182);
    expect(universities.certified_language).toHaveLength(124);
    expect(universities.precise_review_degree).toHaveLength(16);
    expect(universities.precise_review_language).toHaveLength(4);
  });
});

describe("시간제취업 허용 시간: 학위과정 (W03)", () => {
  it("학사 2학년 TOPIK 3급: 주중 25, 주말·방학 제한 없음, 인증대학 등 30 (E39)", () => {
    const r = partTimeHours({ stay: "D-2-2", year: 2, korean: { topik: 3 } });
    expect(r.status).toBe("ok");
    expect(r.hours).toEqual({ weekday: 25, weekendVacation: "제한 없음", ifCertifiedOrExcellent: 30 });
  });

  it("학사 3학년 TOPIK 3급: 기준(4급) 미충족 → 주당 10시간, 주말·방학 포함 (E40)", () => {
    const r = partTimeHours({ stay: "D-2-2", year: 3, korean: { topik: 3 } });
    expect(r.hours).toEqual({ weeklyTotal: 10, weekendVacation: "주당 한도에 포함" });
    expect(r.facts.join()).toContain("TOPIK 4급");
  });

  it("전문학사는 학년과 관계없이 3급 기준", () => {
    expect(partTimeHours({ stay: "D-2-1", korean: { topik: 3 } }).hours?.weekday).toBe(25);
  });

  it("인증대학 등에 해당: 학사 30, 석박사 35", () => {
    expect(partTimeHours({ stay: "D-2-2", year: 1, korean: { topik: 3 }, certifiedOrExcellent: true }).hours?.weekday).toBe(30);
    expect(partTimeHours({ stay: "D-2-3", korean: { topik: 4 }, certifiedOrExcellent: true }).hours?.weekday).toBe(35);
  });

  it("석·박사: 미충족 15, 충족 주중 30", () => {
    expect(partTimeHours({ stay: "D-2-4", korean: { topik: 3 } }).hours?.weeklyTotal).toBe(15);
    expect(partTimeHours({ stay: "D-2-3", korean: { topik: 4 }, certifiedOrExcellent: false }).hours).toEqual({
      weekday: 30,
      weekendVacation: "제한 없음",
    });
  });

  it("사회통합프로그램·세종학당도 기준으로 인정", () => {
    expect(partTimeHours({ stay: "D-2-2", year: 1, korean: { kiipPreTestScore: 61 } }).hours?.weekday).toBe(25);
    expect(partTimeHours({ stay: "D-2-2", year: 1, korean: { kiipPreTestScore: 60 } }).hours?.weeklyTotal).toBe(10);
    expect(partTimeHours({ stay: "D-2-2", year: 4, korean: { kiipStage: 4 } }).hours?.weekday).toBe(25);
    expect(partTimeHours({ stay: "D-2-2", year: 4, korean: { sejong: "중급1" } }).hours?.weeklyTotal).toBe(10);
    expect(partTimeHours({ stay: "D-2-2", year: 4, korean: { sejong: "중급2" } }).hours?.weekday).toBe(25);
  });

  it("영어트랙: 학년 관계없이 영어 성적으로 충족", () => {
    expect(partTimeHours({ stay: "D-2-2", englishTrack: { ielts: 5.5 } }).hours?.weekday).toBe(25);
    expect(partTimeHours({ stay: "D-2-2", englishTrack: { toeflIbt: 70 } }).status).toBe("need_info");
  });

  it("조건이 빠지면 숫자를 내지 않고 되묻기 (E38)", () => {
    const r = partTimeHours({ stay: "D-2-2" });
    expect(r.status).toBe("need_info");
    expect(r.hours).toBeUndefined();
    expect(r.missing).toEqual(["학년(1~4)", "한국어 성적(TOPIK/사회통합프로그램/세종학당)"]);
  });

  it("성적이 없다고 답하면(빈 객체) 미충족으로 판정", () => {
    expect(partTimeHours({ stay: "D-2-2", year: 1, korean: {} }).hours?.weeklyTotal).toBe(10);
  });

  it("D-2-5 연구과정은 대상 아님, D-2-6·7·8은 시간표 근거 없음", () => {
    expect(partTimeHours({ stay: "D-2-5" }).status).toBe("not_eligible");
    expect(partTimeHours({ stay: "D-2-6", korean: { topik: 4 } }).status).toBe("not_covered");
    expect(partTimeHours({ stay: "D-2-8", monthsSinceEntry: 3 }).status).toBe("not_eligible");
  });
});

describe("시간제취업 허용 시간: 어학연수 (W02, W04)", () => {
  it("입국 7개월, TOPIK 2급: 주당 20시간, 주말·방학 합산, 1345 확인 권고 (E41)", () => {
    const r = partTimeHours({ stay: "D-4-1", monthsSinceEntry: 7, korean: { topik: 2 }, certifiedOrExcellent: false });
    expect(r.hours).toEqual({ weeklyTotal: 20, weekendVacation: "주당 한도에 포함" });
    expect(r.cautions.join()).toContain("1345");
  });

  it("어학연수 3개월 차: 아직 신청 불가 (E42)", () => {
    const r = partTimeHours({ stay: "D-4-1", monthsSinceEntry: 3 });
    expect(r.status).toBe("not_eligible");
    expect(r.facts.join()).toContain("6개월");
  });

  it("미충족 10, 인증대학 등 충족 25", () => {
    expect(partTimeHours({ stay: "D-4-1", monthsSinceEntry: 6, korean: { topik: 1 } }).hours?.weeklyTotal).toBe(10);
    expect(partTimeHours({ stay: "D-4-1", monthsSinceEntry: 6, korean: { topik: 2 }, certifiedOrExcellent: true }).hours?.weeklyTotal).toBe(25);
  });

  it("기간을 모르면 되묻기", () => {
    expect(partTimeHours({ stay: "D-4-1", korean: { topik: 2 } }).missing).toContain("입국(또는 D-4 변경) 후 지난 기간");
  });
});

describe("시간제취업: 졸업 후 구직 D-10-1 (W11)", () => {
  it("TOPIK 4급: 주중 25시간, 주말 제한 없음, 수수료 12만원 (E61)", () => {
    const r = partTimeHours({ stay: "D-10-1", korean: { topik: 4 } });
    expect(r.hours).toEqual({ weekday: 25, weekendVacation: "제한 없음" });
    expect(r.cautions.join()).toContain("12만원");
    expect(r.facts.join()).toContain("3년 미만");
  });

  it("사회통합프로그램 5단계 이상은 주중 30시간, 한국어 요건 미충족은 대상 아님", () => {
    expect(partTimeHours({ stay: "D-10-1", korean: { kiipStage: 5 } }).hours?.weekday).toBe(30);
    expect(partTimeHours({ stay: "D-10-1", korean: { topik: 3 } }).status).toBe("not_eligible");
  });
});

describe("재정 증명 금액 (P11, P12, P13)", () => {
  it("과정·소재지를 모르면 되묻기 (E02)", () => {
    expect(financeRequirement({ stay: "D-2-2" }).status).toBe("need_info");
    expect(financeRequirement({ stay: "D-4-1" }).missing).toEqual(["학교 소재지(수도권/지방)"]);
  });

  it("지방 학사: 1,600만원, 3개월 (E03)", () => {
    const r = financeRequirement({ stay: "D-2-2", region: "지방" });
    expect(r.minBalance).toBe(16_000_000);
    expect(r.minMonthsDeposited).toBe(3);
    expect(r.facts.join()).toContain("1,600만원");
  });

  it("수도권 학위과정 2,000만원, 하노이 컨설팅대 6개월 안내", () => {
    const r = financeRequirement({ stay: "D-2-1", region: "수도권", consulate: "하노이" });
    expect(r.minBalance).toBe(20_000_000);
    expect(r.cautions.join()).toContain("컨설팅 대학");
  });

  it("서울 어학연수: 1,000만원, 6개월 (E04), 지방 800만원", () => {
    expect(financeRequirement({ stay: "D-4-1", region: "수도권" })).toMatchObject({ minBalance: 10_000_000, minMonthsDeposited: 6 });
    expect(financeRequirement({ stay: "D-4-1", region: "지방" }).minBalance).toBe(8_000_000);
  });

  it("박사과정은 예치기간 요건 없음 (E05)", () => {
    const r = financeRequirement({ stay: "D-2-4", region: "수도권" });
    expect(r.minMonthsDeposited).toBeNull();
    expect(r.facts.join()).toContain("D-2-4~D-2-8");
  });

  it("양도 통장 불인정, TOPIK 4급 면제는 예정 사항 (E06, E49)", () => {
    const c = financeRequirement({ stay: "D-2-2", region: "지방" }).cautions.join();
    expect(c).toContain("양도한 통장");
    expect(c).toContain("현행이 아님");
  });

  it("교환학생 1년, 하노이: 1,069,654원 × 12 (E25)", () => {
    const r = financeRequirement({ stay: "D-2-6", consulate: "하노이", months: 12 });
    expect(r.byConsulate).toEqual([
      { consulate: "하노이", monthly: 1_069_654, months: 12, total: 12_835_848, plusTuition: false },
    ]);
    expect(r.cautions.join()).toContain("매년 갱신");
    expect(r.facts.join()).not.toContain("1,148,166");
  });

  it("교환학생 6개월, 공관 모름: 세 공관 금액을 각각 (E67)", () => {
    const r = financeRequirement({ stay: "D-2-6", months: 6 });
    expect(r.byConsulate!.map((b) => [b.consulate, b.total])).toEqual([
      ["하노이", 1_069_654 * 6],
      ["호치민", 1_148_166 * 6],
      ["다낭", 1_069_654 * 6],
    ]);
  });

  it("다낭 방문학생 12개월: 12,835,848원 + 등록금 (P13 예시)", () => {
    const r = financeRequirement({ stay: "D-2-8", consulate: "다낭", months: 12 });
    expect(r.byConsulate![0]).toMatchObject({ total: 12_835_848, plusTuition: true });
  });

  it("카드에 없는 과정은 금액을 내지 않음", () => {
    const r = financeRequirement({ stay: "D-4-7", region: "수도권" });
    expect(r.status).toBe("not_covered");
    expect(r.minBalance).toBeUndefined();
  });
});

describe("근거 카드 ID", () => {
  it("규칙 함수가 돌려주는 카드 ID는 모두 cards.json 에 있음", () => {
    const results = [
      lookupUniversity("성균관대"),
      partTimeHours({ stay: "D-2-2", year: 2, korean: { topik: 3 } }),
      partTimeHours({ stay: "D-4-1", monthsSinceEntry: 7, korean: { topik: 2 } }),
      partTimeHours({ stay: "D-10-1", korean: { topik: 4 } }),
      financeRequirement({ stay: "D-2-2", region: "지방" }),
      financeRequirement({ stay: "D-4-1", region: "수도권" }),
      financeRequirement({ stay: "D-2-6", months: 6 }),
    ];
    for (const r of results) for (const id of r.cardIds) expect(cardIds.has(id), id).toBe(true);
  });
});
