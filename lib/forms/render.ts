// 사증발급신청서 초안 PDF 만들기. 브라우저에서 실행되며 입력값은 서버로 가지 않는다.
// 1) planVisa17: 입력값 → 칸별 그리기 목록 + 상태(딱 맞음/작게/별지/빈칸) — 입력 화면의 칸 상태 표시에도 쓴다
// 2) renderVisa17: 서식 PDF 위에 그리고, 넘친 내용은 별지 페이지로 붙인다
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { fitText, DEFAULT_FIT } from "@/lib/forms/fit";
import { dateParts, formatDate, passportName, stripDiacritics } from "@/lib/forms/text";
import {
  ALL_FIELDS,
  APPLICANT_NAME_BOX,
  DRAFT_NOTE,
  isVisible,
  type Box,
  type Field,
  type FormValues,
  type Label,
  type TableField,
  type TableRow,
  type TextStyle,
} from "@/lib/forms/visa17";

export type FieldStatus = "empty" | "fit" | "shrunk" | "annex" | "unsupported";

export interface FontLike {
  width: (text: string, size: number) => number;
  hasChar: (codePoint: number) => boolean;
}

type DrawOp =
  | { kind: "text"; page: number; x: number; baseline: number; size: number; text: string }
  | { kind: "check"; page: number; x: number; y: number };

export interface AnnexItem {
  no: string;
  label: Label;
  text: string;
}

export interface Plan {
  ops: DrawOp[];
  status: Record<string, FieldStatus>;
  annex: AnnexItem[];
  missing: Field[];
  unsupported: Record<string, string>; // 칸 id → PDF 글꼴에 없는 글자들
  warnings: Label[];
}

const ANNEX_MARK = "→ 별지 Tờ rời";
const PAD = 1.5;

export function styleText(value: string, style: TextStyle | "date"): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (style === "name") return passportName(v);
  if (style === "digits") return v.replace(/\s/g, "");
  return stripDiacritics(v);
}

function str(values: FormValues, id: string): string {
  const v = values[id];
  return typeof v === "string" ? v : "";
}

function rows(values: FormValues, id: string): TableRow[] {
  const v = values[id];
  return Array.isArray(v) ? v.filter((r) => Object.values(r).some((x) => x && x.trim())) : [];
}

function periodText(row: TableRow, col: string, order: "ymd" | "dmy"): string {
  const from = row[`${col}From`] ?? "";
  const to = row[`${col}To`] ?? "";
  if (!from && !to) return "";
  return `${from ? formatDate(from, order) : ""} ~ ${to ? formatDate(to, order) : ""}`;
}

export function planVisa17(values: FormValues, font: FontLike): Plan {
  const plan: Plan = { ops: [], status: {}, annex: [], missing: [], unsupported: {}, warnings: [] };

  const badChars = (text: string) => [...new Set([...text].filter((ch) => !font.hasChar(ch.codePointAt(0)!) && ch.trim()))].join("");

  // 한 칸에 글 넣기. 결과 상태를 돌려준다
  const place = (box: Box, text: string, opts: PlaceOpts): FieldStatus => {
    if (!text) return "empty";
    const bad = badChars(text);
    if (bad) {
      if (opts.fieldId) plan.unsupported[opts.fieldId] = bad;
      return "unsupported";
    }
    const pad = opts.pad ?? PAD;
    const width = box.x1 - box.x0 - pad * 2;
    const height = box.bottom - box.top;
    const maxLines = opts.maxLines ?? (height >= 2 * DEFAULT_FIT.min * DEFAULT_FIT.lineHeight ? 2 : 1);
    let fit = fitText(text, width, height, font.width, { ...DEFAULT_FIT, maxLines, min: opts.min ?? DEFAULT_FIT.min });
    let status: FieldStatus = fit.status === "overflow" ? "annex" : fit.status;
    if (fit.status === "overflow") {
      if (opts.annex) plan.annex.push(opts.annex);
      fit = fitText(ANNEX_MARK, width, height, font.width, { ...DEFAULT_FIT, maxLines: 1, min: 4 });
      if (fit.status === "overflow") return status;
    }
    const lineH = fit.size * DEFAULT_FIT.lineHeight;
    const top = box.top + (height - lineH * fit.lines.length) / 2;
    fit.lines.forEach((line, i) => {
      const w = font.width(line, fit.size as number);
      const x = opts.center ? box.x0 + (box.x1 - box.x0 - w) / 2 : box.x0 + pad;
      plan.ops.push({ kind: "text", page: box.page, x, baseline: top + i * lineH + fit.size * 0.935, size: fit.size, text: line });
    });
    return status;
  };

  for (const f of ALL_FIELDS) {
    if (!isVisible(f, values)) {
      plan.status[f.id] = "empty";
      continue;
    }
    const annexOf = (text: string): AnnexItem => ({ no: f.no, label: f.label, text });

    if (f.kind === "text") {
      const raw = str(values, f.id);
      const text = raw.trim() ? styleText(raw, f.style) + (f.suffix ?? "") : "";
      plan.status[f.id] = place(f.box, text, { maxLines: f.maxLines, center: f.style === "digits" && f.box.x1 - f.box.x0 < 30, annex: annexOf(text), fieldId: f.id });
      if (!text && f.required) plan.missing.push(f);
    } else if (f.kind === "select") {
      const v = str(values, f.id);
      plan.status[f.id] = place(f.box, v, { fieldId: f.id });
      if (!v && f.required) plan.missing.push(f);
    } else if (f.kind === "choice") {
      const v = str(values, f.id);
      const opt = f.options.find((o) => o.value === v);
      if (opt) plan.ops.push({ kind: "check", page: opt.mark.page, x: opt.mark.x, y: opt.mark.y });
      plan.status[f.id] = opt ? "fit" : "empty";
      if (!opt && f.required) plan.missing.push(f);
    } else if (f.kind === "date") {
      const v = str(values, f.id);
      if (!v) {
        plan.status[f.id] = "empty";
        if (f.required) plan.missing.push(f);
      } else if (f.slots) {
        const p = dateParts(v);
        const s = f.slots;
        // ( / / ) 사이 칸은 좁아서 최소 크기를 더 낮춘다
        const slot = (x: [number, number], t: string) => place({ page: s.page, x0: x[0], x1: x[1], top: s.top, bottom: s.bottom }, t, { maxLines: 1, center: true, min: 5, pad: 0.3 });
        plan.status[f.id] = p ? [slot(s.y, p.y), slot(s.m, p.m), slot(s.d, p.d)].reduce((a, c) => (c === "shrunk" ? c : a), "fit" as FieldStatus) : "empty";
      } else if (f.box) {
        plan.status[f.id] = place(f.box, formatDate(v, f.order), { maxLines: 1 });
      }
    } else if (f.kind === "table") {
      plan.status[f.id] = planTable(f, rows(values, f.id), place, plan);
      if (rows(values, f.id).length === 0 && f.required) plan.missing.push(f);
    }
  }

  // 12 서약의 신청인 성명 = 1.1 성 + 명
  const applicant = passportName(`${str(values, "surname")} ${str(values, "givenName")}`);
  place(APPLICANT_NAME_BOX, applicant, { maxLines: 1 });

  // 확인용 경고 (막지는 않는다)
  const expiry = str(values, "passportExpiry");
  const entry = str(values, "entryDate");
  if (expiry && entry && expiry <= entry) plan.warnings.push({ ko: "여권 기간만료일(3.6)이 입국예정일(8.3)보다 빠르거나 같아요.", vi: "Ngày hết hạn hộ chiếu (3.6) sớm hơn hoặc trùng ngày dự định nhập cảnh (8.3)." });
  const email = str(values, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) plan.warnings.push({ ko: "전자우편(4.4) 형식을 확인해 주세요.", vi: "Hãy kiểm tra lại định dạng e-mail (4.4)." });

  return plan;
}

interface PlaceOpts {
  maxLines?: number;
  center?: boolean;
  annex?: AnnexItem;
  fieldId?: string;
  min?: number; // 최소 글자 크기 (기본 6.5pt)
  pad?: number;
}
type Place = (box: Box, text: string, opts: PlaceOpts) => FieldStatus;

// 표: 서식 줄 수를 넘는 줄과, 칸에 안 들어가는 글은 별지로
function planTable(f: TableField, list: TableRow[], place: Place, plan: Plan): FieldStatus {
  if (list.length === 0) return "empty";
  let status: FieldStatus = "fit";
  const cellText = (row: TableRow, c: TableField["columns"][number]) => {
    if (c.type === "period") return periodText(row, c.id, c.order ?? "ymd");
    const v = row[c.id] ?? "";
    if (c.type === "date") return v ? formatDate(v, c.order ?? "ymd") : "";
    return styleText(v, c.type === "name" ? "name" : "text");
  };
  const rowText = (row: TableRow) => f.columns.map((c) => `${c.label.ko} ${c.label.vi}: ${cellText(row, c)}`).join(" / ");

  list.forEach((row, i) => {
    if (i >= f.rows.length) {
      plan.annex.push({ no: f.no, label: f.label, text: `(${i + 1}) ${rowText(row)}` });
      status = "annex";
      return;
    }
    const [top, bottom] = f.rows[i];
    for (const c of f.columns) {
      const text = cellText(row, c);
      const s = place({ page: f.page, x0: c.x0 + 1, x1: c.x1 - 1, top: top + 0.5, bottom: bottom - 0.5 }, text, {
        annex: { no: f.no, label: f.label, text: `(${i + 1}) ${c.label.ko} ${c.label.vi}: ${text}` },
        fieldId: f.id,
      });
      if (s === "annex" || s === "unsupported" || (s === "shrunk" && status === "fit")) status = s;
    }
  });
  return status;
}

// ---- PDF ----

export async function loadFont(doc: PDFDocument, fontBytes: ArrayBuffer | Uint8Array): Promise<{ font: PDFFont; like: FontLike }> {
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const chars = new Set(font.getCharacterSet());
  return { font, like: { width: (t, s) => font.widthOfTextAtSize(t, s), hasChar: (cp) => chars.has(cp) } };
}

const GRAY = rgb(0.35, 0.35, 0.35);
const INK = rgb(0.05, 0.1, 0.35);

function drawCheck(page: PDFPage, x: number, y: number) {
  const h = page.getHeight();
  // √ 모양을 선 두 개로 그린다 (글꼴과 무관)
  page.drawLine({ start: { x: x - 3, y: h - y }, end: { x: x - 0.8, y: h - y - 2.6 }, thickness: 1.1, color: INK });
  page.drawLine({ start: { x: x - 0.8, y: h - y - 2.6 }, end: { x: x + 3.4, y: h - y + 3.4 }, thickness: 1.1, color: INK });
}

function drawAnnex(doc: PDFDocument, font: PDFFont, items: AnnexItem[]) {
  const W = 595.28;
  const H = 841.89;
  const margin = 56;
  const size = 9.5;
  const lineH = size * 1.4;
  let page = doc.addPage([W, H]);
  let y = margin;
  const text = (t: string, x: number, s: number, color = rgb(0, 0, 0)) => page.drawText(t, { x, y: H - y, size: s, font, color });
  const newPageIfNeeded = (need: number) => {
    if (y + need > H - margin) {
      page = doc.addPage([W, H]);
      y = margin;
    }
  };
  text("별지 / TỜ RỜI — 사증발급신청서 추가 기재사항 / Nội dung khai thêm của Đơn xin cấp visa", margin, 11);
  y += 16;
  text(DRAFT_NOTE, margin, 7, GRAY);
  y += 20;
  for (const item of items) {
    const head = `${item.no} ${item.label.ko} / ${item.label.vi}`;
    const body = wrapPlain(item.text, W - margin * 2 - 12, size, font);
    newPageIfNeeded(lineH * (body.length + 1) + 6);
    for (const l of wrapPlain(head, W - margin * 2, size, font)) {
      text(l, margin, size, GRAY);
      y += lineH;
    }
    for (const l of body) {
      text(l, margin + 12, size);
      y += lineH;
    }
    y += 6;
  }
}

function wrapPlain(t: string, width: number, size: number, font: PDFFont): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of t.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export async function renderVisa17(values: FormValues, templateBytes: ArrayBuffer | Uint8Array, fontBytes: ArrayBuffer | Uint8Array) {
  const doc = await PDFDocument.load(templateBytes);
  const { font, like } = await loadFont(doc, fontBytes);
  const plan = planVisa17(values, like);
  const pages = doc.getPages();
  for (const op of plan.ops) {
    const page = pages[op.page - 1];
    if (op.kind === "check") drawCheck(page, op.x, op.y);
    else page.drawText(op.text, { x: op.x, y: page.getHeight() - op.baseline, size: op.size, font, color: INK });
  }
  for (const page of pages) {
    const w = font.widthOfTextAtSize(DRAFT_NOTE, 7);
    page.drawText(DRAFT_NOTE, { x: (page.getWidth() - w) / 2, y: page.getHeight() - 40, size: 7, font, color: GRAY });
  }
  if (plan.annex.length > 0) drawAnnex(doc, font, plan.annex);
  doc.setTitle("Visa application draft (HANARU)");
  const bytes = await doc.save();
  return { bytes, plan };
}
