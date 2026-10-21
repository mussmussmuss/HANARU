import Anthropic from "@anthropic-ai/sdk";

// SDK는 환경변수 ANTHROPIC_BASE_URL 도 읽는다. 개발 환경에 다른 용도로 설정돼 있을 수 있어
// 항상 공식 주소를 쓰고, 키는 ANTHROPIC_API_KEY 에서만 읽는다.
export function anthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: "https://api.anthropic.com" });
}
