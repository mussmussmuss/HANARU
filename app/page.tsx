import Chat from "@/components/Chat";
import { cards } from "@/lib/kb";

export default function Page() {
  return <Chat cardCount={cards.length} />;
}
