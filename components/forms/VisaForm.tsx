"use client";

// 사증발급신청서 초안 입력 화면. 입력값은 이 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { loadFont, planVisa17, renderVisa17, styleText, type FieldStatus, type FontLike, type Plan } from "@/lib/forms/render";
import { isVisible, VISA17, type Field, type FormValues, type Label, type TableField, type TableRow } from "@/lib/forms/visa17";

const STORAGE_KEY = "hanaru.form.visa17";
const TEMPLATE_URL = "/forms/visa17-kr-vn.pdf";
const FONT_URL = "/fonts/HanaruSans-Regular.ttf";

const STATUS_LABEL: Record<Exclude<FieldStatus, "empty">, Label & { tone: string }> = {
  fit: { vi: "Vừa ô", ko: "칸에 맞음", tone: "ok" },
  shrunk: { vi: "Chữ nhỏ lại", ko: "작게 들어감", tone: "ok" },
  annex: { vi: "Sang tờ rời", ko: "별지로 넘어감", tone: "warn" },
  unsupported: { vi: "Có ký tự không in được", ko: "넣을 수 없는 글자", tone: "danger" },
};

function L({ label }: { label: Label }) {
  return (
    <>
      {label.vi}
      <span className="ko"> · {label.ko}</span>
    </>
  );
}

function load(): FormValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FormValues) : {};
  } catch {
    return {};
  }
}

export default function VisaForm() {
  const [values, setValues] = useState<FormValues>({});
  const [loaded, setLoaded] = useState(false);
  const [font, setFont] = useState<FontLike | null>(null);
  const [bytes, setBytes] = useState<{ template: ArrayBuffer; font: ArrayBuffer } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValues(load());
    setLoaded(true);
    // 서식과 글꼴을 불러와 칸 맞춤 상태를 미리 계산한다
    (async () => {
      try {
        const [t, f] = await Promise.all([fetch(TEMPLATE_URL).then((r) => r.arrayBuffer()), fetch(FONT_URL).then((r) => r.arrayBuffer())]);
        setBytes({ template: t, font: f });
        const doc = await PDFDocument.create();
        setFont((await loadFont(doc, f)).like);
      } catch {
        setError("Không tải được mẫu đơn. · 서식을 불러오지 못했어요.");
      }
    })();
  }, []);

  // 입력이 바뀌면 이 기기에 저장
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      } catch {}
    }, 400);
  }, [values, loaded]);

  const plan: Plan | null = useMemo(() => (font ? planVisa17(values, font) : null), [values, font]);
  const missingIds = useMemo(() => new Set(plan?.missing.map((f) => f.id) ?? []), [plan]);

  const set = (id: string, v: string | TableRow[]) => {
    setPdfUrl(null);
    setValues((cur) => ({ ...cur, [id]: v }));
  };

  async function makePdf() {
    if (!bytes) return;
    setBusy(true);
    setError(null);
    try {
      const { bytes: out } = await renderVisa17(values, bytes.template, bytes.font);
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }));
      setPdfUrl(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = "HANARU-visa-application-draft.pdf";
      a.click();
    } catch {
      setError("Không tạo được PDF. · PDF를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    if (!confirm("Xóa toàn bộ nội dung đã nhập? · 입력한 내용을 모두 지울까요?")) return;
    setValues({});
    setPdfUrl(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  return (
    <main className="form-page">
      <header className="form-header">
        <Link href="/" className="form-back" aria-label="Quay lại · 돌아가기">
          ←
        </Link>
        <div>
          <h1>Đơn xin cấp visa · 사증발급신청서</h1>
          <p>Bản nháp (mẫu số 17) · 초안 (별지 제17호서식)</p>
        </div>
      </header>

      <section className="form-intro">
        <p>
          Nhập nội dung theo từng mục của mẫu đơn, HANARU sẽ điền vào mẫu đơn và tạo file PDF bản nháp. Bạn tự kiểm tra, dán ảnh, ký tên và tự nộp.
          <span className="ko">서식 순서대로 입력하면 서식에 채운 초안 PDF를 만들어요. 확인·사진 부착·서명·제출은 본인이 직접 해요.</span>
        </p>
        <p>
          Câu trả lời phải bằng tiếng Hàn hoặc tiếng Anh. Dấu tiếng Việt sẽ tự động được bỏ (Nguyễn → NGUYEN).
          <span className="ko">답은 한글 또는 영문으로 써야 해요. 베트남어 성조는 자동으로 빼요.</span>
        </p>
        <p className="form-privacy">
          Nội dung chỉ lưu trên trình duyệt của máy này, không gửi lên máy chủ. Nếu dùng máy tính chung, hãy bấm “Xóa hết” khi xong.
          <span className="ko">입력 내용은 이 기기 브라우저에만 저장되고 서버로 보내지 않아요. 공용 컴퓨터라면 끝난 뒤 &apos;모두 지우기&apos;를 눌러 주세요.</span>
        </p>
      </section>

      {VISA17.map((section) => {
        const visible = section.fields.filter((f) => isVisible(f, values));
        const missing = visible.filter((f) => missingIds.has(f.id)).length;
        return (
          <details key={section.id} className="form-section" open={section.id === "s1"}>
            <summary>
              <span>
                <L label={section.title} />
              </span>
              {plan && <span className={`form-count ${missing ? "warn" : "ok"}`}>{missing ? `${missing} ô trống · 빈칸 ${missing}` : "✓"}</span>}
            </summary>
            {visible.map((f) => (
              <FieldInput key={f.id} field={f} values={values} set={set} status={plan?.status[f.id]} bad={plan?.unsupported[f.id]} missing={missingIds.has(f.id)} />
            ))}
          </details>
        );
      })}

      <section className="form-sign-note">
        <p>
          Họ tên người đăng ký ở mục 12 được điền tự động từ mục 1.1. Ô ký tên và ảnh để trống: bạn tự ký và dán ảnh (35×45mm) sau khi in.
          <span className="ko">12 서약의 신청인 성명은 1.1에서 자동으로 채워요. 서명란과 사진 칸은 비워 두니, 출력한 뒤 직접 서명하고 사진(35×45mm)을 붙이세요.</span>
        </p>
      </section>

      <footer className="form-footer">
        {plan && plan.missing.length > 0 && (
          <p className="form-warn">
            Còn {plan.missing.length} mục bắt buộc chưa điền (vẫn có thể tạo bản nháp). · 필수 칸 {plan.missing.length}개가 비어 있어요(초안은 만들 수 있어요).
          </p>
        )}
        {plan?.warnings.map((w, i) => (
          <p key={i} className="form-warn">
            {w.vi} · {w.ko}
          </p>
        ))}
        {plan && plan.annex.length > 0 && (
          <p className="form-note">
            {plan.annex.length} nội dung dài sẽ được in ở tờ rời cuối file. · 긴 내용 {plan.annex.length}개는 마지막 별지 페이지에 들어가요.
          </p>
        )}
        {error && <p className="form-warn">{error}</p>}
        <div className="form-actions">
          <button className="primary" onClick={makePdf} disabled={!bytes || busy}>
            {busy ? "Đang tạo… · 만드는 중" : "Tạo PDF bản nháp · 초안 PDF 만들기"}
          </button>
          {pdfUrl && (
            <a className="button" href={pdfUrl} target="_blank" rel="noopener">
              Mở PDF · PDF 열기
            </a>
          )}
          <button onClick={clearAll}>Xóa hết · 모두 지우기</button>
        </div>
      </footer>
    </main>
  );
}

function StatusChip({ status, bad }: { status?: FieldStatus; bad?: string }) {
  if (!status || status === "empty") return null;
  const s = STATUS_LABEL[status];
  return (
    <span className={`fit-chip ${s.tone}`}>
      {s.vi} · {s.ko}
      {bad ? ` (${bad})` : ""}
    </span>
  );
}

function FieldInput({
  field: f,
  values,
  set,
  status,
  bad,
  missing,
}: {
  field: Field;
  values: FormValues;
  set: (id: string, v: string | TableRow[]) => void;
  status?: FieldStatus;
  bad?: string;
  missing: boolean;
}) {
  const v = typeof values[f.id] === "string" ? (values[f.id] as string) : "";
  const head = (
    <div className="field-head">
      <span className="field-no">{f.no}</span>
      <span className="field-label">
        <L label={f.label} />
        {f.required && <span className="req"> *</span>}
      </span>
    </div>
  );

  if (f.kind === "choice") {
    return (
      <div className={`field ${missing ? "missing" : ""}`}>
        {head}
        <div className="choice">
          {f.options.map((o) => (
            <button key={o.value} type="button" className={v === o.value ? "on" : ""} onClick={() => set(f.id, v === o.value ? "" : o.value)}>
              {o.label.vi}
              <small>{o.label.ko}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (f.kind === "select") {
    return (
      <div className={`field ${missing ? "missing" : ""}`}>
        {head}
        <select value={v} onChange={(e) => set(f.id, e.target.value)}>
          <option value="">— Chọn · 선택 —</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label.vi} · {o.label.ko}
            </option>
          ))}
        </select>
        <StatusChip status={status} />
      </div>
    );
  }

  if (f.kind === "date") {
    return (
      <div className={`field ${missing ? "missing" : ""}`}>
        {head}
        <input type="date" value={v} onChange={(e) => set(f.id, e.target.value)} />
        <StatusChip status={status} />
      </div>
    );
  }

  if (f.kind === "table") return <TableInput field={f} values={values} set={set} status={status} bad={bad} missing={missing} head={head} />;

  // text
  const out = v.trim() ? styleText(v, f.style) + (f.suffix ?? "") : "";
  return (
    <div className={`field ${missing ? "missing" : ""}`}>
      {head}
      <input
        type={f.id === "email" ? "email" : "text"}
        inputMode={f.style === "digits" ? "numeric" : undefined}
        value={v}
        maxLength={400}
        onChange={(e) => set(f.id, e.target.value)}
      />
      {out && out !== v.trim() && (
        <p className="field-out">
          Vào đơn · 서식에 들어갈 글: <b>{out}</b>
        </p>
      )}
      <StatusChip status={status} bad={bad} />
    </div>
  );
}

function TableInput({
  field: f,
  values,
  set,
  status,
  bad,
  missing,
  head,
}: {
  field: TableField;
  values: FormValues;
  set: (id: string, v: string | TableRow[]) => void;
  status?: FieldStatus;
  bad?: string;
  missing: boolean;
  head: React.ReactNode;
}) {
  const rows = Array.isArray(values[f.id]) ? (values[f.id] as TableRow[]) : [];
  const list = rows.length ? rows : [{}];
  const update = (i: number, key: string, val: string) => set(f.id, list.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  return (
    <div className={`field ${missing ? "missing" : ""}`}>
      {head}
      {list.map((row, i) => (
        <div key={i} className="table-row">
          <div className="table-row-head">
            <span>
              {i + 1}
              {i >= f.rows.length && <small> — Tờ rời · 별지</small>}
            </span>
            {list.length > 1 && (
              <button type="button" onClick={() => set(f.id, list.filter((_, j) => j !== i))} aria-label="Xóa dòng · 줄 삭제">
                ✕
              </button>
            )}
          </div>
          {f.columns.map((c) =>
            c.type === "period" ? (
              <label key={c.id} className="table-cell">
                <span>
                  <L label={c.label} />
                </span>
                <span className="period">
                  <input type="date" value={row[`${c.id}From`] ?? ""} onChange={(e) => update(i, `${c.id}From`, e.target.value)} />
                  ~
                  <input type="date" value={row[`${c.id}To`] ?? ""} onChange={(e) => update(i, `${c.id}To`, e.target.value)} />
                </span>
              </label>
            ) : (
              <label key={c.id} className="table-cell">
                <span>
                  <L label={c.label} />
                </span>
                <input type={c.type === "date" ? "date" : "text"} value={row[c.id] ?? ""} maxLength={200} onChange={(e) => update(i, c.id, e.target.value)} />
              </label>
            ),
          )}
        </div>
      ))}
      <button type="button" className="add-row" onClick={() => set(f.id, [...list, {}])}>
        + Thêm dòng · 줄 추가
      </button>
      <StatusChip status={status} bad={bad} />
    </div>
  );
}
