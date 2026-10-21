import Chat from "@/components/Chat";
import type { CardMeta } from "@/components/CardSheet";
import { cards, sources } from "@/lib/kb";

// 근거 칩을 눌렀을 때 보여줄 카드 정보. 검수된 쉬운 설명과 출처만 보내고, 규정 원문은 보내지 않는다
const cardMeta: Record<string, CardMeta> = Object.fromEntries(
  cards.map((c) => [
    c.id,
    {
      title: c.title,
      status: c.status,
      easyVi: c.easy_vi,
      easyKo: c.easy_ko,
      sources: c.sources.map(([id, where]) => {
        const s = sources[id];
        return { name: s ? `${s.name} · ${s.org}` : id, date: s?.date ?? "", where };
      }),
    },
  ]),
);

export default function Page() {
  return <Chat cardCount={cards.length} cardMeta={cardMeta} />;
}
