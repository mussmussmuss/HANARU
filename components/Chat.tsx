"use client";

import { useEffect, useRef, useState } from "react";

type Message =
  | { role: "user"; text: string }
  | { role: "bot"; vi: string; ko: string }
  | { role: "notice"; text: string };

const WELCOME: Message = {
  role: "bot",
  vi: "Xin chào! Mình là HANARU. Bạn cứ hỏi mình về visa du học (D-2, D-4) và thủ tục nhập cảnh Hàn Quốc nhé. Mình sẽ trả lời từng chút một.",
  ko: "안녕하세요! 저는 HANARU예요. 한국 유학 비자(D-2, D-4)와 입국 절차에 대해 편하게 물어보세요. 하나씩 차근차근 알려드릴게요.",
};

// 빠른 질문: 평가 질문 세트에 있는 대표 질문들
const QUICK = [
  { vi: "Visa D-2 và D-4 khác nhau thế nào?", ko: "D-2와 D-4는 뭐가 달라요?" },
  { vi: "Cần chứng minh tài chính bao nhiêu?", ko: "재정 증명은 얼마나 필요해요?" },
  { vi: "Du học sinh được làm thêm mấy giờ?", ko: "유학생은 아르바이트 몇 시간 할 수 있어요?" },
  { vi: "Sau khi nhập cảnh phải làm gì?", ko: "입국하고 나서 뭘 해야 해요?" },
];

export default function Chat({ cardCount }: { cardCount: number }) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setInput("");
    // 1단계(골격): 아직 챗봇이 연결되지 않았다. 가짜 답변은 만들지 않는다.
    setMessages((m) => [
      ...m,
      { role: "user", text: t },
      { role: "notice", text: "Chatbot sẽ được kết nối ở bước tiếp theo. · 챗봇은 다음 단계에서 연결됩니다." },
    ]);
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
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="bubble user">{m.text}</div>
          ) : m.role === "bot" ? (
            <div key={i} className="bubble bot">
              <div>{m.vi}</div>
              <div className="ko">{m.ko}</div>
            </div>
          ) : (
            <p key={i} className="notice">{m.text}</p>
          ),
        )}
        <div ref={endRef} />
      </section>

      <nav className="quick" aria-label="Câu hỏi nhanh · 빠른 질문">
        {QUICK.map((q) => (
          <button key={q.ko} onClick={() => send(`${q.vi}\n${q.ko}`)}>
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
        <button type="submit" disabled={!input.trim()} aria-label="Gửi · 보내기">
          ↑
        </button>
      </form>
    </main>
  );
}
