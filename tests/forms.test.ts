import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fitText } from "@/lib/forms/fit";
import { formatDate, passportName, stripDiacritics } from "@/lib/forms/text";
import { loadFont, planVisa17, renderVisa17, type FontLike } from "@/lib/forms/render";
import type { FormValues } from "@/lib/forms/visa17";

const template = fs.readFileSync("public/forms/visa17-kr-vn.pdf");
const fontBytes = fs.readFileSync("public/fonts/HanaruSans-Regular.ttf");

async function font(): Promise<FontLike> {
  return (await loadFont(await PDFDocument.create(), fontBytes)).like;
}

describe("서식 글자 변환", () => {
  it("베트남어 성조를 빼고 이름은 여권식 대문자", () => {
    expect(stripDiacritics("Số 12, Đường Lê Lợi, Quận 1")).toBe("So 12, Duong Le Loi, Quan 1");
    expect(passportName("  Nguyễn   Thị Minh Đức ")).toBe("NGUYEN THI MINH DUC");
    expect(stripDiacritics("부산광역시 남구")).toBe("부산광역시 남구");
  });

  it("날짜는 서식 원본 순서대로", () => {
    expect(formatDate("2003-04-09", "ymd")).toBe("2003/04/09");
    expect(formatDate("2003-04-09", "dmy")).toBe("09/04/2003");
  });
});

describe("긴 글 자동 맞춤", () => {
  const measure = (t: string, size: number) => t.length * size * 0.5;
  it("들어가면 기본 크기, 길면 작게, 더 길면 두 줄, 그래도 넘치면 별지", () => {
    expect(fitText("ABCD", 100, 12, measure)).toMatchObject({ status: "fit", size: 9 });
    expect(fitText("A".repeat(25), 100, 12, measure)).toMatchObject({ status: "shrunk", size: 8 });
    const two = fitText("word ".repeat(10).trim(), 100, 22, measure);
    expect(two.status).toBe("shrunk");
    expect(two.status !== "overflow" && two.lines.length).toBe(2);
    expect(fitText("word ".repeat(40).trim(), 100, 22, measure).status).toBe("overflow");
  });
});

describe("사증발급신청서 초안", () => {
  it("이름은 대문자로, 선택은 체크로, 조건이 안 맞는 칸은 그리지 않는다", async () => {
    const v: FormValues = { surname: "Nguyễn", givenName: "Văn Đức", sex: "male", otherName: "no", otherSurname: "Trần", birthDate: "2003-04-09" };
    const plan = planVisa17(v, await font());
    const texts = plan.ops.flatMap((o) => (o.kind === "text" ? [o.text] : []));
    expect(texts).toContain("NGUYEN");
    expect(texts).toContain("VAN DUC");
    expect(texts).toContain("2003/04/09");
    expect(texts).toContain("NGUYEN VAN DUC"); // 12 서약 신청인 성명
    expect(texts).not.toContain("TRAN"); // 1.8이 '아니요'면 다른 성명 칸은 비움
    expect(plan.ops.filter((o) => o.kind === "check")).toHaveLength(2);
    expect(plan.missing.map((f) => f.id)).toContain("passportNo");
  });

  it("8.6 방문기간은 일/월/년, 서식 줄 수를 넘는 줄은 별지로", async () => {
    const visits = Array.from({ length: 6 }, (_, i) => ({ purpose: `Trip ${i + 1}`, periodFrom: "2024-08-01", periodTo: "2024-08-20" }));
    const plan = planVisa17({ visitedKorea: "yes", koreaVisits: visits }, await font());
    expect(plan.ops.some((o) => o.kind === "text" && o.text === "01/08/2024 ~ 20/08/2024")).toBe(true);
    expect(plan.status.koreaVisits).toBe("annex");
    expect(plan.annex.map((a) => a.text).join()).toContain("Trip 6");
  });

  it("칸에 안 들어가는 긴 글은 표시만 하고 별지로, 글꼴에 없는 글자는 알린다", async () => {
    const plan = planVisa17({ currentAddress: "Very long address ".repeat(20), hanjaName: "阮文德" }, await font());
    expect(plan.status.currentAddress).toBe("annex");
    expect(plan.ops.some((o) => o.kind === "text" && o.text.includes("별지"))).toBe(true);
    expect(plan.status.hanjaName).toBe("unsupported");
    expect(plan.unsupported.hanjaName).toBe("阮文德");
  });

  it("PDF는 서식 5쪽, 별지가 있으면 한 쪽 더", async () => {
    const plain = await PDFDocument.load((await renderVisa17({ surname: "Le" }, template, fontBytes)).bytes);
    expect(plain.getPageCount()).toBe(5);
    const withAnnex = await PDFDocument.load((await renderVisa17({ currentAddress: "x ".repeat(400) }, template, fontBytes)).bytes);
    expect(withAnnex.getPageCount()).toBe(6);
  });
});
