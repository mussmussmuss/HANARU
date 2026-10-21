// 서식 입력값 변환: 서식은 한글 또는 영문만 받으므로 베트남어 성조를 없애고, 이름은 여권처럼 대문자로.

/** 베트남어 성조·기호 제거: "Nguyễn Văn Đức" → "Nguyen Van Duc" (한글은 그대로) */
export function stripDiacritics(text: string): string {
  return text
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    // 라틴 문자에 붙은 결합 기호만 지운다 (한글 자모 분해는 아래 NFC로 다시 합쳐진다)
    .replace(/([A-Za-z])[̀-ͯ]+/g, "$1")
    .normalize("NFC");
}

/** 여권식 이름: 성조 제거 + 대문자 + 공백 정리 */
export function passportName(text: string): string {
  return stripDiacritics(text).toUpperCase().replace(/\s+/g, " ").trim();
}

export function hasVietnameseDiacritics(text: string): boolean {
  return stripDiacritics(text) !== text;
}

/** "2001-03-09"(입력창 값) → 서식의 날짜 순서로 */
export type DateOrder = "ymd" | "dmy";
export function formatDate(iso: string, order: DateOrder): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return order === "ymd" ? `${y}/${mo}/${d}` : `${d}/${mo}/${y}`;
}

export function dateParts(iso: string): { y: string; m: string; d: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { y: m[1], m: m[2], d: m[3] } : null;
}
