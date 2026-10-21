"use client";

import { useEffect, useState } from "react";
import type { CardMeta } from "@/components/CardSheet";
import type { Summary } from "@/lib/summary";

export type SummaryState = { status: "loading" } | { status: "ready"; summary: Summary } | { status: "error"; message: string; retry: boolean };
export type SummaryLang = "both" | "vi" | "ko";

type Line = { vi: string; ko: string };

const LANG_LABEL: Record<SummaryLang, string> = { both: "VI+KO", vi: "Tiếng Việt", ko: "한국어" };

// 제목은 고른 언어로. 병기면 "베트남어 · 한국어"
function heading(lang: SummaryLang, vi: string, ko: string) {
  return lang === "both" ? `${vi} · ${ko}` : lang === "vi" ? vi : ko;
}

function LineItem({ line, lang }: { line: Line; lang: SummaryLang }) {
  if (lang !== "both") return <li>{line[lang]}</li>;
  return (
    <li>
      {line.vi}
      <span className="ko">{line.ko}</span>
    </li>
  );
}

// 복사용 글. 메신저에 붙여 넣기 좋게 기호만 쓴 일반 텍스트
function plainText(s: Summary, lang: SummaryLang, cardMeta: Record<string, CardMeta>, date: string): string {
  const line = (l: Line) => (lang === "both" ? `- ${l.vi}\n  ${l.ko}` : `- ${l[lang]}`);
  const out: string[] = [heading(lang, "HANARU · Tóm tắt cuộc trò chuyện", "HANARU · 대화 요약") + ` (${date})`, ""];
  const section = (vi: string, ko: string, lines: Line[]) => {
    if (lines.length === 0) return;
    out.push(`[${heading(lang, vi, ko)}]`, ...lines.map(line), "");
  };
  section("Tình hình của bạn", "내 상황", s.situation);
  for (const t of s.topics) {
    out.push(`[${lang === "both" ? `${t.title.vi} · ${t.title.ko}` : t.title[lang]}]`, ...t.points.map(line));
    const cited = t.cards.filter((id) => cardMeta[id]);
    if (cited.length) out.push(`  ${heading(lang, "Căn cứ", "근거")}: ${cited.map((id) => `${id} ${cardMeta[id].title}`).join(", ")}`);
    out.push("");
  }
  section("Việc cần làm", "할 일", s.todo);
  section("Cần xác nhận thêm", "더 확인할 것", s.open);
  out.push(heading(lang, "Quyết định cuối cùng thuộc về cơ quan đại diện và xuất nhập cảnh.", "최종 결정은 공관·출입국이 해요."));
  return out.join("\n");
}

export default function SummarySheet({
  state,
  initialLang,
  cardMeta,
  onClose,
  onRetry,
}: {
  state: SummaryState;
  initialLang: SummaryLang;
  cardMeta: Record<string, CardMeta>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [lang, setLang] = useState<SummaryLang>(initialLang);
  const [copied, setCopied] = useState(false);
  const date = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    if (state.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(plainText(state.summary, lang, cardMeta, date));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="summary-sheet" role="dialog" aria-modal="true" aria-labelledby="summary-title">
      <div className="summary-actions">
        <button onClick={onClose} aria-label="Đóng · 닫기">
          ←
        </button>
        <div className="summary-lang" role="group" aria-label="Ngôn ngữ · 언어">
          {(["both", "vi", "ko"] as const).map((l) => (
            <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" && (
        <div className="summary-status">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p>Đang tóm tắt cuộc trò chuyện… · 대화를 요약하고 있어요…</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="summary-status error">
          <p>{state.message}</p>
          {state.retry && <button onClick={onRetry}>Thử lại · 다시 시도</button>}
        </div>
      )}

      {state.status === "ready" && (
        <>
          <article className={`summary-doc ${lang}`}>
            <header>
              <h2 id="summary-title">{heading(lang, "Tóm tắt cuộc trò chuyện", "대화 요약")}</h2>
              <p className="summary-meta">
                HANARU · {date}
              </p>
            </header>

            {state.summary.situation.length > 0 && (
              <section>
                <h3>{heading(lang, "Tình hình của bạn", "내 상황")}</h3>
                <ul>{state.summary.situation.map((l, i) => <LineItem key={i} line={l} lang={lang} />)}</ul>
              </section>
            )}

            {state.summary.topics.map((t, i) => {
              const cited = t.cards.filter((id) => cardMeta[id]);
              return (
                <section key={i}>
                  <h3>{lang === "both" ? `${t.title.vi} · ${t.title.ko}` : t.title[lang]}</h3>
                  <ul>{t.points.map((l, j) => <LineItem key={j} line={l} lang={lang} />)}</ul>
                  {cited.length > 0 && (
                    <p className="summary-cards">
                      {heading(lang, "Căn cứ", "근거")}: {cited.map((id) => `${id} ${cardMeta[id].title}`).join(" · ")}
                    </p>
                  )}
                </section>
              );
            })}

            {state.summary.todo.length > 0 && (
              <section>
                <h3>{heading(lang, "Việc cần làm", "할 일")}</h3>
                <ul>{state.summary.todo.map((l, i) => <LineItem key={i} line={l} lang={lang} />)}</ul>
              </section>
            )}

            {state.summary.open.length > 0 && (
              <section>
                <h3>{heading(lang, "Cần xác nhận thêm", "더 확인할 것")}</h3>
                <ul>{state.summary.open.map((l, i) => <LineItem key={i} line={l} lang={lang} />)}</ul>
              </section>
            )}

            <footer>
              {heading(lang, "Quyết định cuối cùng thuộc về cơ quan đại diện và xuất nhập cảnh.", "최종 결정은 공관·출입국이 해요.")}
              <br />
              {heading(
                lang,
                "Bản demo HANARU · tóm tắt từ cuộc trò chuyện, không lưu trên máy chủ.",
                "HANARU 데모 · 대화 내용으로 만든 요약, 서버에 저장 안 함.",
              )}
            </footer>
          </article>

          <div className="summary-buttons">
            <button onClick={() => window.print()}>
              Lưu PDF / In
              <small>PDF로 저장·인쇄</small>
            </button>
            <button onClick={copy}>
              {copied ? "Đã sao chép" : "Sao chép"}
              <small>{copied ? "복사했어요" : "텍스트 복사"}</small>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
