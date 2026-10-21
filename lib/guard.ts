// API 라우트 공통: 데모 공개 링크용 요청 제한과 오류 코드
import Anthropic from "@anthropic-ai/sdk";

// 서버 인스턴스별, IP당 10분에 limit회
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

export function rateLimited(req: Request, bucket: string, limit: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > limit;
}

export function errorCode(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "auth";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503)) return "overloaded";
  return "server";
}

export function json(status: number, body: object) {
  return Response.json(body, { status });
}
