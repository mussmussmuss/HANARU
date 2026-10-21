# 카드·평가셋을 검사하고 cards.json, eval.json, 검토용 문서를 만든다.
# 실행: python3 kb/source/build.py  (결과는 kb/ 에 생성)
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from sources import SOURCES, STATUS
from cards import CARDS
from evalset import EVAL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
uni = json.load(open(os.path.join(ROOT, "universities.json"), encoding="utf-8"))

errors = []
ids = [c["id"] for c in CARDS]
if len(ids) != len(set(ids)):
    errors.append("카드 ID 중복")
for c in CARDS:
    if c["status"] not in STATUS:
        errors.append(f"{c['id']}: 알 수 없는 상태 {c['status']}")
    for s in c["sources"]:
        if s[0] not in SOURCES:
            errors.append(f"{c['id']}: 알 수 없는 출처 {s[0]}")
    for f in ("rule", "easy_ko", "easy_vi", "sources"):
        if not c[f]:
            errors.append(f"{c['id']}: {f} 비어 있음")
for q in EVAL:
    for cid in q["cards"]:
        if cid not in ids:
            errors.append(f"{q['id']}: 없는 카드 {cid}")
    if q["type"] == "되묻기" and not q["ask"]:
        errors.append(f"{q['id']}: 되묻기 유형인데 ask 없음")

# 평가셋의 학교 관련 정답을 명단과 대조
def has(lst, name): return name in uni[lst]
checks = [
    ("E14", has("certified_degree", "충북대학교") and not has("excellent_certified", "충북대학교")),
    ("E15", has("certified_degree", "대구한의대학교") and has("precise_review_language", "대구한의대학교")),
    ("E17", has("excellent_certified", "성균관대학교")),
    ("P23 예시", has("certified_degree", "대구한의대학교") and has("precise_review_language", "대구한의대학교")),
]
for name, ok in checks:
    if not ok:
        errors.append(f"학교 명단 대조 실패: {name}")
for k, n in {"excellent_certified": 43, "certified_degree": 182, "certified_language": 124,
             "precise_review_degree": 16, "precise_review_language": 4}.items():
    if len(uni[k]) != n:
        errors.append(f"universities.json {k}: {len(uni[k])}교 (원문 {n}교)")

if errors:
    print("검사 실패:"); [print(" -", e) for e in errors]; sys.exit(1)

json.dump({"sources": SOURCES, "status": STATUS, "cards": CARDS},
          open(os.path.join(ROOT, "cards.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(EVAL, open(os.path.join(ROOT, "eval.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# 검토용 문서
L = []
w = L.append
w("# HANARU 규정 카드 초안 (검토용)\n")
w(f"대상: 베트남 국적 유학생·유학 준비생 (D-2, D-4) · 카드 {len(CARDS)}장 · 평가 질문 {len(EVAL)}개\n")
w("> 이 문서는 `tools/` 의 원본에서 자동 생성됩니다. 수정은 원본(cards.py)에 하고 `python3 tools/build.py` 를 다시 실행하세요.\n")
w("## 검토 방법\n")
w("1. 먼저 아래 **검수가 필요한 카드**부터 확인해 주세요. 출처끼리 내용이 다르거나 근거가 일부만 있는 카드입니다.")
w("2. 각 카드의 **규정(원문 근거)** 이 원문과 같은지, **쉬운 설명** 이 규정을 벗어나지 않는지 확인해 주세요.")
w("3. 베트남어 설명은 초안입니다. 원어민 검수가 필요합니다.\n")
w("## 상태 표시\n")
w("| 상태 | 뜻 |\n|---|---|")
for k, v in STATUS.items(): w(f"| {k} | {v} |")
w("")
w("## 출처\n")
w("| ID | 자료 | 기관 | 기준일 | 비고 |\n|---|---|---|---|---|")
for k, s in SOURCES.items(): w(f"| {k} | {s['name']} | {s['org']} | {s['date']} | {s['note']} |")
w("")
need = [c for c in CARDS if c["status"] in ("충돌", "자료부족")]
w(f"## 검수가 필요한 카드 ({len(need)}장)\n")
w("| 카드 | 제목 | 상태 | 확인할 점 |\n|---|---|---|---|")
for c in need:
    w(f"| {c['id']} | {c['title']} | {c['status']} | {' / '.join(c['notes']) or '-'} |")
w("")
cats = []
for c in CARDS:
    if c["category"] not in cats: cats.append(c["category"])
for cat in cats:
    w(f"## {cat}\n")
    for c in [x for x in CARDS if x["category"] == cat]:
        w(f"### {c['id']} {c['title']}  `{c['status']}`\n")
        if c["when"]: w("**먼저 확인할 조건:** " + ", ".join(c["when"]) + "\n")
        w("**규정 (원문 근거)**\n")
        for r in c["rule"]: w(f"- {r}")
        w("\n**쉬운 설명 (한국어)**\n")
        w(f"> {c['easy_ko']}\n")
        w("**쉬운 설명 (베트남어, 초안)**\n")
        w(f"> {c['easy_vi']}\n")
        w("**출처:** " + "; ".join(f"{s[0]} {s[1]}" for s in c["sources"]) + "\n")
        if c["notes"]:
            w("**메모**\n")
            for n in c["notes"]: w(f"- {n}")
            w("")
w("## 평가 질문 세트\n")
w("| ID | 유형 | 질문 | 꼭 들어갈 내용 | 들어가면 오답 | 먼저 되물을 것 | 카드 |\n|---|---|---|---|---|---|---|")
for q in EVAL:
    w(f"| {q['id']} | {q['type']} | {q['q_ko']} | {' / '.join(q['must']) or '-'} | {' / '.join(q['must_not']) or '-'} | {' / '.join(q['ask']) or '-'} | {', '.join(q['cards'])} |")
open(os.path.join(ROOT, "검토용_규정카드_초안.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")

from collections import Counter
print("검사 통과")
print("카드", len(CARDS), dict(Counter(c["status"] for c in CARDS)))
print("평가", len(EVAL), dict(Counter(q["type"] for q in EVAL)))
used = {cid for q in EVAL for cid in q["cards"]}
print("평가에서 안 쓰인 카드:", [i for i in ids if i not in used])
