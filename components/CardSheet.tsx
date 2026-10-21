"use client";

import { useEffect } from "react";

export interface CardMeta {
  title: string;
  status: string;
  easyVi: string;
  easyKo: string;
  sources: { name: string; date: string; where: string }[];
}

export const STATUS_LABEL: Record<string, { vi: string; ko: string; tone: string }> = {
  확정: { vi: "Đã xác nhận", ko: "확정", tone: "ok" },
  공관별상이: { vi: "Khác nhau theo cơ quan", ko: "공관별로 다름", tone: "warn" },
  충돌: { vi: "Cần kiểm tra thêm", ko: "확인 필요", tone: "warn" },
  개편예정: { vi: "Dự kiến thay đổi, chưa áp dụng", ko: "개편 예정 (아직 시행 전)", tone: "warn" },
  자료부족: { vi: "Thông tin chưa đủ", ko: "자료 부족", tone: "warn" },
  안전: { vi: "Nguyên tắc trả lời", ko: "답변 원칙", tone: "ok" },
};

export default function CardSheet({ id, card, onClose }: { id: string; card: CardMeta; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = STATUS_LABEL[card.status];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <p className="sheet-id">
          {id}
          {status && (
            <span className={`badge ${status.tone}`}>
              {status.vi} · {status.ko}
            </span>
          )}
        </p>
        <h2 id="sheet-title">{card.title}</h2>
        <p>{card.easyVi}</p>
        <p className="ko">{card.easyKo}</p>
        <h3>Nguồn · 출처</h3>
        <ul>
          {card.sources.map((s, i) => (
            <li key={i}>
              <strong>{s.name}</strong>
              {s.date && <span> ({s.date})</span>}
              <br />
              <span className="where">{s.where}</span>
            </li>
          ))}
        </ul>
        <button className="sheet-close" onClick={onClose}>
          Đóng · 닫기
        </button>
      </div>
    </div>
  );
}
