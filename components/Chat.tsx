"use client";

import { useEffect, useRef, useState } from "react";
import { parseAnswer } from "@/lib/answer";

export interface CardMeta {
  title: string;
  source: string;
}

type Message =
  | { role: "user"; text: string }
  | { role: "bot"; raw: string; cards: string[]; streaming?: boolean }
  | { role: "notice"; text: string };

const WELCOME_RAW =
  "<vi>Xin chào! Mình là HANARU. Bạn cứ hỏi mình về visa du học (D-2, D-4) và thủ tục nhập cảnh Hàn Quốc nhé. Mình sẽ trả lời từng chút một.</vi>" +
  "<ko>안녕하세요! 저는 HANARU예요. 한국 유학 비자(D-2, D-4)와 입국 절차에 대해 편하게 물어보세요. 하나씩 차근차근 알려드릴게요.</ko>";

// 빠른 질문: 평가 질문 세트에 있는 대표 질문들
const QUICK = [
  { vi: "Visa D-2 và D-4 khác nhau thế nào?", ko: "D-2와 D-4는 뭐가 달라요?" },
  { vi: "Cần chứng minh tài chính bao nhiêu?", ko: "재정 증명은 얼마나 필요해요?" },
  { vi: "Du học sinh được làm thêm mấy giờ?", ko: "유학생은 아르바이트 몇 시간 할 수 있어요?" },
  { vi: "Sau khi nhập cảnh phải làm gì?", ko: "입국하고 나서 뭘 해야 해요?" },
];

const ERRORS: Record<string, string> = {
  no_api_key: "Chưa cài đặt khóa API. · API 키가 설정되지 않았어요.",
  too_many_requests: "Bạn hỏi hơi nhanh, hãy thử lại sau ít phút. · 질문이 너무 많아요. 몇 분 뒤 다시 시도해 주세요.",
  refusal: "Mình không thể trả lời câu này. Hãy hỏi 1345. · 이 질문에는 답할 수 없어요. 1345에 문의해 주세요.",
  rate_limited: "Hệ thống đang bận, hãy thử lại sau. · 지금 요청이 많아요. 잠시 뒤 다시 시도해 주세요.",
  overloaded: "Hệ thống đang bận, hãy thử lại sau. · 지금 요청이 많아요. 잠시 뒤 다시 시도해 주세요.",
  default: "Đã xảy ra lỗi, hãy thử lại. · 오류가 났어요. 다시 시도해 주세요.",
};

const TOOL_LABEL: Record<string, string> = {
  lookup_university: "Đang tra danh sách trường · 학교 명단 확인 중",
  part_time_hours: "Đang tính giờ làm thêm · 아르바이트 시간 계산 중",
  finance_requirement: "Đang tính số tiền chứng minh · 재정 금액 계산 중",
};

export default function Chat({ cardCount, cardMeta }: { cardCount: number; cardMeta: Record<string, CardMeta> }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "bot", raw: WELCOME_RAW, cards: [] }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // API로 보낼 대화: 첫 인사말과 안내문은 빼고, 사용자 질문과 완성된 답만
  function history(list: Message[]) {
    const out: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of list.slice(1)) {
      if (m.role === "user") out.push({ role: "user", content: m.text });
      else if (m.role === "bot" && m.raw) out.push({ role: "assistant", content: m.raw });
    }
    // 실패한 질문 뒤에 다시 질문하면 user가 연속될 수 있으므로 합친다
    return out.reduce<typeof out>((acc, m) => {
      const last = acc[acc.length - 1];
      if (last && last.role === m.role) last.content += `\n${m.content}`;
      else acc.push({ ...m });
      return acc;
    }, []);
  }

  function updateBot(fn: (m: Extract<Message, { role: "bot" }>) => Extract<Message, { role: "bot" }>) {
    setMessages((list) => {
      const copy = [...list];
      const last = copy[copy.length - 1];
      if (last?.role === "bot") copy[copy.length - 1] = fn(last);
      return copy;
    });
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setBusy(true);
    const next: Message[] = [...messages, { role: "user", text: t }];
    setMessages(next);

    const fail = (code: string) => {
      setMessages((list) => {
        const copy = list.filter((m) => !(m.role === "bot" && m.streaming));
        return [...copy, { role: "notice", text: ERRORS[code] ?? ERRORS.default }];
      });
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history(next) }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        fail(err.error ?? "default");
        return;
      }
      setMessages((list) => [...list, { role: "bot", raw: "", cards: [], streaming: true }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.t === "iteration") updateBot((m) => ({ ...m, raw: "" }));
          else if (ev.t === "delta") {
            setStatus(null);
            updateBot((m) => ({ ...m, raw: m.raw + ev.text }));
          } else if (ev.t === "tool") setStatus(TOOL_LABEL[ev.name] ?? null);
          else if (ev.t === "done") updateBot((m) => ({ ...m, cards: ev.cards, streaming: false }));
          else if (ev.t === "error") {
            fail(ev.code);
            return;
          }
        }
      }
    } catch {
      fail("default");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <main className="phone">
      <header className="header">
        <div className="avatar">H</div>
        <div>
          <h1>HANARU</h1>
          <p>Hỏi đáp visa du học · 유학 비자 Q&amp;A</p>
        </div>
      </header>

      <section className="messages" aria-live="polite">
        <p className="notice">
          Bản demo · 데모 버전 — {cardCount} quy định đã kiểm tra · 검수된 규정 {cardCount}개 기준
        </p>
        {messages.map((m, i) => {
          if (m.role === "user") return <div key={i} className="bubble user">{m.text}</div>;
          if (m.role === "notice") return <p key={i} className="notice">{m.text}</p>;
          const a = parseAnswer(m.raw);
          if (m.streaming && !a.vi && !a.ko && !a.raw) {
            return <div key={i} className="bubble bot typing">{status ?? "…"}</div>;
          }
          return (
            <div key={i} className="bubble bot">
              {a.raw !== undefined ? (
                <div>{a.raw}</div>
              ) : (
                <>
                  <div>{a.vi}</div>
                  {a.ko && <div className="ko">{a.ko}</div>}
                </>
              )}
              {m.cards.length > 0 && (
                <div className="chips">
                  {m.cards.map((id) => (
                    <span key={id} className="chip" title={cardMeta[id]?.title}>
                      {id} · {cardMeta[id]?.source}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </section>

      <nav className="quick" aria-label="Câu hỏi nhanh · 빠른 질문">
        {QUICK.map((q) => (
          <button key={q.ko} disabled={busy} onClick={() => send(`${q.vi}\n${q.ko}`)}>
            {q.vi}
          </button>
        ))}
      </nav>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          rows={1}
          value={input}
          placeholder="Nhập câu hỏi · 질문을 입력하세요"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Gửi · 보내기">
          ↑
        </button>
      </form>
    </main>
  );
}
