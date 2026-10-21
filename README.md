# HANARU

베트남 유학생·유학 준비생(D-2, D-4)을 위한 입국·비자 안내 챗봇 데모 (모바일 웹앱).

- 답변은 베트남어·한국어 병기
- 검수된 규정 카드(`kb/cards.json`)에 있는 내용으로만 답한다
- 개인정보는 서버에 저장하지 않는다 (대화는 브라우저 메모리에만)

## 실행

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력
npm run dev
```

## 지식 베이스

`kb/` 의 JSON은 별도 지식 베이스 작업(규정 카드 원본 `tools/cards.py` → `build.py`)에서 생성한 파일을 복사한 것이다. 직접 고치지 않는다.

| 파일 | 내용 |
|---|---|
| `kb/cards.json` | 규정 카드 56장과 출처 목록 |
| `kb/universities.json` | 2025년 인증대학·비자정밀심사대학 명단 |
| `kb/eval.json` | 평가 질문 67개 |
