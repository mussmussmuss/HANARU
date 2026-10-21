// 긴 글 자동 맞춤: 칸 너비·높이에 맞게 글자 크기를 줄이고, 필요하면 두 줄로 나누고, 그래도 안 되면 별지로 보낸다.

export interface FitOptions {
  size: number; // 기본 글자 크기(pt)
  min: number; // 최소 글자 크기(pt)
  step: number;
  lineHeight: number; // 글자 크기 대비 줄 높이
  maxLines: number;
}

export const DEFAULT_FIT: FitOptions = { size: 9, min: 6.5, step: 0.5, lineHeight: 1.15, maxLines: 2 };

export type FitResult =
  | { status: "fit" | "shrunk"; size: number; lines: string[] }
  | { status: "overflow" };

type Measure = (text: string, size: number) => number;

// 단어 단위로 줄을 나눈다. 한 단어가 너무 길면 글자 단위로 자른다
function wrap(text: string, width: number, size: number, measure: Measure): string[] {
  const lines: string[] = [];
  let cur = "";
  const push = (w: string) => {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, size) <= width) {
      cur = next;
      return;
    }
    if (cur) lines.push(cur);
    cur = "";
    if (measure(w, size) <= width) {
      cur = w;
      return;
    }
    let part = "";
    for (const ch of w) {
      if (measure(part + ch, size) > width && part) {
        lines.push(part);
        part = ch;
      } else part += ch;
    }
    cur = part;
  };
  for (const w of text.split(/\s+/).filter(Boolean)) push(w);
  if (cur) lines.push(cur);
  return lines;
}

export function fitText(text: string, width: number, height: number, measure: Measure, opt: FitOptions = DEFAULT_FIT): FitResult {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return { status: "fit", size: opt.size, lines: [] };
  for (let lines = 1; lines <= opt.maxLines; lines++) {
    for (let size = opt.size; size >= opt.min - 1e-9; size -= opt.step) {
      // 한 줄이면 글자 높이만, 여러 줄이면 줄 간격까지 들어가야 한다
      const need = lines === 1 ? size : lines * size * opt.lineHeight;
      if (need > height + 0.5) continue;
      const wrapped = lines === 1 ? [t] : wrap(t, width, size, measure);
      if (wrapped.length <= lines && wrapped.every((l) => measure(l, size) <= width)) {
        return { status: size === opt.size && lines === 1 ? "fit" : "shrunk", size, lines: wrapped };
      }
    }
  }
  return { status: "overflow" };
}
