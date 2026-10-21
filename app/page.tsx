import Chat, { type CardMeta } from "@/components/Chat";
import { cards, sourceLabel } from "@/lib/kb";

// 근거 칩에 보여줄 카드 제목과 첫 번째 출처 (카드 본문은 브라우저로 보내지 않는다)
const cardMeta: Record<string, CardMeta> = Object.fromEntries(
  cards.map((c) => [c.id, { title: c.title, source: c.sources[0] ? sourceLabel(c.sources[0][0]) : "" }]),
);

export default function Page() {
  return <Chat cardCount={cards.length} cardMeta={cardMeta} />;
}
