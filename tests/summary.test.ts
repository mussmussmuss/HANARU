import { describe, expect, it } from "vitest";
import { transcript, unsupportedNumbers, type Summary } from "@/lib/summary";

const conversation = transcript([
  { role: "user", content: "부산 학사인데 재정 증명 얼마예요?" },
  {
    role: "assistant",
    content:
      "<vi>Trường ở địa phương: tối thiểu 16 triệu won (1.600만원), gửi ít nhất 3 tháng.</vi><ko>지방 소재 대학은 최소 1,600만원 이상을 3개월 이상 예치해요.</ko><cards>P11</cards>",
  },
]);

const base: Summary = { situation: [], topics: [], todo: [], open: [] };

describe("대화 요약 숫자 확인", () => {
  it("대화의 HANARU 답을 두 언어와 근거 카드까지 넘긴다", () => {
    expect(conversation).toContain("[학생] 부산 학사인데");
    expect(conversation).toContain("1,600만원");
    expect(conversation).toContain("16 triệu won");
    expect(conversation).toContain("(근거 카드: P11)");
  });

  it("대화에 있는 숫자만 쓰면 통과", () => {
    const s: Summary = {
      ...base,
      topics: [{ title: { vi: "Tài chính", ko: "재정 증명" }, points: [{ vi: "Tối thiểu 16 triệu won, gửi 3 tháng", ko: "최소 1,600만원, 3개월 예치" }], cards: ["P11"] }],
    };
    expect(unsupportedNumbers(s, conversation)).toEqual([]);
  });

  it("대화에 없는 숫자는 찾아낸다", () => {
    const s: Summary = {
      ...base,
      todo: [{ vi: "Gửi 6 tháng", ko: "2,000만원을 6개월 예치" }],
    };
    expect(unsupportedNumbers(s, conversation).sort()).toEqual(["2000", "6"]);
  });
});
