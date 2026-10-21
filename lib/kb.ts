// 지식 베이스 로드. 원본은 hanaru-kb 저장소의 tools/cards.py → build.py 로 생성한 JSON.
import cardsData from "@/kb/cards.json";
import universitiesData from "@/kb/universities.json";

export type CardStatus = "확정" | "공관별상이" | "충돌" | "개편예정" | "자료부족" | "안전";

export interface Card {
  id: string;
  category: string;
  title: string;
  status: CardStatus;
  when: string[];
  rule: string[];
  easy_ko: string;
  easy_vi: string;
  sources: [string, string][];
  notes: string[];
}

export interface Source {
  name: string;
  org: string;
  date: string;
  note: string;
}

export const cards = cardsData.cards as Card[];
export const sources = cardsData.sources as Record<string, Source>;
export const statusRules = cardsData.status as Record<CardStatus, string>;
export const universities = universitiesData;

const byId = new Map(cards.map((c) => [c.id, c]));

export function getCard(id: string): Card | undefined {
  return byId.get(id);
}

// 화면의 근거 칩에 쓰는 짧은 출처 문구. 예: "주호치민 대한민국 총영사관 2026-01-05"
export function sourceLabel(sourceId: string): string {
  const s = sources[sourceId];
  return s ? `${s.org} ${s.date}`.trim() : sourceId;
}
