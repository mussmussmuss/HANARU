// 모델 답변 형식 <vi>…</vi><ko>…</ko><cards>…</cards> 을 나눈다. 스트리밍 중 덜 끝난 태그도 처리한다.
export interface ParsedAnswer {
  vi: string;
  ko: string;
  cards: string[];
  /** 형식을 지키지 않은 답 (태그가 없음) */
  raw?: string;
}

function section(text: string, tag: string): string | undefined {
  const start = text.indexOf(`<${tag}>`);
  if (start < 0) return undefined;
  const body = text.slice(start + tag.length + 2);
  const end = body.indexOf(`</${tag}>`);
  // 스트리밍 중: 닫는 태그 전이면 지금까지 온 부분. 닫는 태그가 반쯤 온 경우("</v")는 잘라낸다
  const partial = end >= 0 ? body.slice(0, end) : body.replace(/<\/?[a-z]*$/, "");
  return partial.trim();
}

export function parseAnswer(text: string): ParsedAnswer {
  const ko = section(text, "ko");
  // <vi> 태그만 빠뜨린 답: <ko> 앞부분을 베트남어로 본다
  const vi = section(text, "vi") ?? (ko !== undefined ? text.slice(0, text.indexOf("<ko>")).replace(/<\/?vi>/g, "").trim() || undefined : undefined);
  const cards = (section(text, "cards") ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (vi === undefined && ko === undefined) {
    return { vi: "", ko: "", cards: [], raw: text.replace(/<\/?[a-z]*$/, "").trim() };
  }
  return { vi: vi ?? "", ko: ko ?? "", cards };
}
