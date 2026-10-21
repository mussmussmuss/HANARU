// 사증발급신청서(별지 제17호서식, 한국어-베트남어판) 칸 정의.
// 좌표는 public/forms/visa17-kr-vn.pdf 기준 pt 단위, 왼쪽 위가 원점(top은 위에서부터). 칸 목록: docs/서식_17호_칸목록.md
import type { DateOrder } from "@/lib/forms/text";

export interface Label {
  ko: string;
  vi: string;
}
export interface Box {
  page: number; // 1부터
  x0: number;
  top: number;
  x1: number;
  bottom: number;
}
export interface Mark {
  page: number;
  x: number; // 체크박스 [ ] 가운데
  y: number;
}
/** 앞 문항의 답에 따라 보이는 칸 */
export type When = { field: string; is: string[] } | { field: string; not: string[] };

interface Base {
  id: string;
  no: string; // 서식 번호 (예: "1.4", "3.7 b)")
  label: Label;
  required?: boolean;
  when?: When;
}
/** name: 여권식 대문자, text: 성조만 제거, digits: 숫자만 */
export type TextStyle = "name" | "text" | "digits";
export interface TextField extends Base {
  kind: "text";
  box: Box;
  style: TextStyle;
  maxLines?: number;
  suffix?: string; // PDF에 붙일 단위 (예: " USD")
}
export interface DateField extends Base {
  kind: "date";
  order: DateOrder;
  box?: Box; // 한 칸에 "yyyy/mm/dd"
  slots?: { page: number; top: number; bottom: number; y: [number, number]; m: [number, number]; d: [number, number] }; // ( / / ) 칸 나눠 쓰기
}
export interface ChoiceField extends Base {
  kind: "choice";
  options: { value: string; label: Label; mark: Mark }[];
}
export interface SelectField extends Base {
  kind: "select";
  box: Box;
  options: { value: string; label: Label }[];
}
export type ColumnType = "text" | "name" | "date" | "period";
export interface TableField extends Base {
  kind: "table";
  page: number;
  rows: [number, number][]; // 각 줄의 top, bottom
  columns: { id: string; label: Label; x0: number; x1: number; type: ColumnType; order?: DateOrder }[];
}
export type Field = TextField | DateField | ChoiceField | SelectField | TableField;

export interface Section {
  id: string;
  title: Label;
  fields: Field[];
}

export type TableRow = Record<string, string>;
export type FormValues = Record<string, string | TableRow[]>;

const YES_NO = (page: number, no: [number, number], yes: [number, number]) => [
  { value: "no", label: { ko: "아니요", vi: "Không" }, mark: { page, x: no[0], y: no[1] } },
  { value: "yes", label: { ko: "예", vi: "Có" }, mark: { page, x: yes[0], y: yes[1] } },
];
const PASSPORT_TYPES = (page: number, dip: [number, number], off: [number, number], reg: [number, number], oth: [number, number]) => [
  { value: "diplomatic", label: { ko: "외교관", vi: "Ngoại giao" }, mark: { page, x: dip[0], y: dip[1] } },
  { value: "official", label: { ko: "관용", vi: "Công vụ" }, mark: { page, x: off[0], y: off[1] } },
  { value: "regular", label: { ko: "일반", vi: "Phổ thông" }, mark: { page, x: reg[0], y: reg[1] } },
  { value: "other", label: { ko: "기타", vi: "Khác" }, mark: { page, x: oth[0], y: oth[1] } },
];
const b = (page: number, x0: number, top: number, x1: number, bottom: number): Box => ({ page, x0, top, x1, bottom });
const yes = (field: string): When => ({ field, is: ["yes"] });

const FAMILY_COLUMNS = [
  { id: "name", label: { ko: "성명", vi: "Họ và tên" }, x0: 58, x1: 192.4, type: "name" as const },
  { id: "birth", label: { ko: "생년월일", vi: "Ngày tháng năm sinh" }, x0: 192.4, x1: 337.7, type: "date" as const, order: "ymd" as const },
  { id: "nationality", label: { ko: "국적", vi: "Quốc tịch" }, x0: 337.7, x1: 430.9, type: "text" as const },
  { id: "relation", label: { ko: "관계", vi: "Quan hệ" }, x0: 430.9, x1: 543, type: "text" as const },
];

export const VISA17: Section[] = [
  {
    id: "s1",
    title: { ko: "1. 인적사항", vi: "1. Thông tin cá nhân" },
    fields: [
      { kind: "text", id: "surname", no: "1.1", label: { ko: "여권에 기재된 영문 성명 — 성", vi: "Họ tên bằng tiếng Anh (như trên hộ chiếu) — Họ" }, box: b(1, 160, 331, 351, 352.5), style: "name", required: true },
      { kind: "text", id: "givenName", no: "1.1", label: { ko: "여권에 기재된 영문 성명 — 명", vi: "Họ tên bằng tiếng Anh (như trên hộ chiếu) — Tên và chữ lót" }, box: b(1, 358, 331, 541, 352.5), style: "name", required: true },
      { kind: "text", id: "hanjaName", no: "1.2", label: { ko: "한자성명", vi: "Họ tên bằng tiếng Hán" }, box: b(1, 160, 370.2, 351, 381.4), style: "text" },
      { kind: "choice", id: "sex", no: "1.3", label: { ko: "성별", vi: "Giới tính" }, required: true, options: [
        { value: "male", label: { ko: "남성", vi: "Nam" }, mark: { page: 1, x: 468.5, y: 376 } },
        { value: "female", label: { ko: "여성", vi: "Nữ" }, mark: { page: 1, x: 531.5, y: 375.5 } },
      ] },
      { kind: "date", id: "birthDate", no: "1.4", label: { ko: "생년월일 (yyyy/mm/dd)", vi: "Ngày tháng năm sinh (yyyy/mm/dd)" }, order: "ymd", box: b(1, 160, 398.6, 351, 410), required: true },
      { kind: "text", id: "nationality", no: "1.5", label: { ko: "국적", vi: "Quốc tịch" }, box: b(1, 358, 398.6, 541, 410), style: "text", required: true },
      { kind: "text", id: "birthCountry", no: "1.6", label: { ko: "출생국가", vi: "Nơi sinh" }, box: b(1, 160, 427.2, 351, 438.7), style: "text", required: true },
      { kind: "text", id: "nationalId", no: "1.7", label: { ko: "국가신분증번호", vi: "Số CMND" }, box: b(1, 358, 427.2, 541, 438.7), style: "text", required: true },
      { kind: "choice", id: "otherName", no: "1.8", label: { ko: "이전에 한국에 출입국하였을 때 다른 성명을 사용했는지 여부", vi: "Người xin cấp visa có từng sử dụng tên khác để nhập cảnh vào Hàn Quốc không?" }, required: true, options: YES_NO(1, [145.6, 483.9], [209, 483.9]) },
      { kind: "text", id: "otherSurname", no: "1.8", label: { ko: "다른 성명 — 성", vi: "Tên khác — Họ" }, box: b(1, 109, 494, 229, 504.5), style: "name", required: true, when: yes("otherName") },
      { kind: "text", id: "otherGivenName", no: "1.8", label: { ko: "다른 성명 — 명", vi: "Tên khác — Tên và chữ lót" }, box: b(1, 313, 494, 450, 504.5), style: "name", required: true, when: yes("otherName") },
      { kind: "choice", id: "multiNationality", no: "1.9", label: { ko: "복수 국적 여부", vi: "Người xin cấp visa có mang nhiều quốc tịch hay không?" }, required: true, options: YES_NO(1, [449.6, 516], [513, 516]) },
      { kind: "text", id: "otherNationalities", no: "1.9", label: { ko: "복수 국적 — 상세내용", vi: "Các quốc tịch cụ thể" }, box: b(1, 389, 525.5, 535.5, 535.5), style: "text", required: true, when: yes("multiNationality") },
    ],
  },
  {
    id: "s2",
    title: { ko: "2. 신청 사증 정보", vi: "2. Thông tin visa đăng ký" },
    fields: [
      { kind: "choice", id: "stayLength", no: "2.1", label: { ko: "체류기간(장·단기)", vi: "Thời gian lưu trú (Dài hạn/Ngắn hạn)" }, required: true, options: [
        { value: "long", label: { ko: "90일 이상 장기체류", vi: "Lưu trú dài hạn trên 90 ngày" }, mark: { page: 1, x: 290.2, y: 582.9 } },
        { value: "short", label: { ko: "90일 이하 단기체류", vi: "Lưu trú ngắn hạn dưới 90 ngày" }, mark: { page: 1, x: 290.5, y: 596 } },
      ] },
      { kind: "select", id: "status", no: "2.2", label: { ko: "체류자격", vi: "Loại visa" }, box: b(1, 337, 578, 541, 601.5), required: true, options: [
        { value: "D-2-1", label: { ko: "D-2-1 전문학사", vi: "D-2-1 Cao đẳng" } },
        { value: "D-2-2", label: { ko: "D-2-2 학사", vi: "D-2-2 Đại học" } },
        { value: "D-2-3", label: { ko: "D-2-3 석사", vi: "D-2-3 Thạc sĩ" } },
        { value: "D-2-4", label: { ko: "D-2-4 박사", vi: "D-2-4 Tiến sĩ" } },
        { value: "D-2-5", label: { ko: "D-2-5 연구과정", vi: "D-2-5 Nghiên cứu" } },
        { value: "D-2-6", label: { ko: "D-2-6 교환학생", vi: "D-2-6 Trao đổi" } },
        { value: "D-2-7", label: { ko: "D-2-7 일-학습연계", vi: "D-2-7 Học kết hợp làm việc" } },
        { value: "D-2-8", label: { ko: "D-2-8 방문학생", vi: "D-2-8 Sinh viên thăm" } },
        { value: "D-4-1", label: { ko: "D-4-1 한국어 연수", vi: "D-4-1 Học tiếng Hàn" } },
        { value: "D-4-7", label: { ko: "D-4-7 외국어 연수", vi: "D-4-7 Học ngoại ngữ" } },
      ] },
    ],
  },
  {
    id: "s3",
    title: { ko: "3. 여권정보", vi: "3. Thông tin hộ chiếu" },
    fields: [
      { kind: "choice", id: "passportType", no: "3.1", label: { ko: "여권종류", vi: "Loại hộ chiếu" }, required: true, options: PASSPORT_TYPES(2, [218.4, 112.8], [453, 112.8], [218.8, 127], [452, 127]) },
      { kind: "text", id: "passportTypeOther", no: "3.1", label: { ko: "여권종류 '기타' 상세내용", vi: "Loại hộ chiếu 'Khác' — cụ thể" }, box: b(2, 294.5, 137, 475.5, 147), style: "text", required: true, when: { field: "passportType", is: ["other"] } },
      { kind: "text", id: "passportNo", no: "3.2", label: { ko: "여권번호", vi: "Số hộ chiếu" }, box: b(2, 62, 162.5, 217, 173), style: "name", required: true },
      { kind: "text", id: "passportCountry", no: "3.3", label: { ko: "발급국가", vi: "Quốc gia cấp" }, box: b(2, 224, 162.2, 378, 173), style: "text", required: true },
      { kind: "text", id: "passportPlace", no: "3.4", label: { ko: "발급지", vi: "Nơi cấp" }, box: b(2, 385, 162.2, 541, 173), style: "text", required: true },
      { kind: "date", id: "passportIssued", no: "3.5", label: { ko: "발급일자", vi: "Ngày cấp" }, order: "ymd", box: b(2, 62, 188.4, 217, 198), required: true },
      { kind: "date", id: "passportExpiry", no: "3.6", label: { ko: "기간만료일", vi: "Ngày hết hạn" }, order: "ymd", box: b(2, 224, 188, 378, 198), required: true },
      { kind: "choice", id: "otherPassport", no: "3.7", label: { ko: "다른 여권 소지 여부", vi: "Người xin cấp visa có sở hữu hộ chiếu còn giá trị sử dụng khác không?" }, required: true, options: YES_NO(2, [531.5, 205.2], [104, 215.2]) },
      { kind: "choice", id: "otherPassportType", no: "3.7 a)", label: { ko: "다른 여권 — 여권종류", vi: "Hộ chiếu khác — Loại hộ chiếu" }, required: true, when: yes("otherPassport"), options: PASSPORT_TYPES(2, [217.5, 261.2], [453.8, 261.2], [215.7, 274.1], [446.1, 274.1]) },
      { kind: "text", id: "otherPassportNo", no: "3.7 b)", label: { ko: "다른 여권 — 여권번호", vi: "Hộ chiếu khác — Số hộ chiếu" }, box: b(2, 72, 293, 220, 308.5), style: "name", required: true, when: yes("otherPassport") },
      { kind: "text", id: "otherPassportCountry", no: "3.7 c)", label: { ko: "다른 여권 — 발급국가", vi: "Hộ chiếu khác — Quốc gia cấp" }, box: b(2, 226, 293, 384, 308.5), style: "text", required: true, when: yes("otherPassport") },
      { kind: "date", id: "otherPassportExpiry", no: "3.7 d)", label: { ko: "다른 여권 — 기간만료일", vi: "Hộ chiếu khác — Ngày hết hạn" }, order: "ymd", box: b(2, 388, 293, 541, 308.5), required: true, when: yes("otherPassport") },
    ],
  },
  {
    id: "s4",
    title: { ko: "4. 연락처", vi: "4. Thông tin liên lạc" },
    fields: [
      { kind: "text", id: "homeAddress", no: "4.1", label: { ko: "본국 주소", vi: "Địa chỉ liên lạc trong nước" }, box: b(2, 238, 336, 541, 356.8), style: "text", required: true },
      { kind: "text", id: "currentAddress", no: "4.2", label: { ko: "현 거주지 (본국 주소와 다를 경우 기재)", vi: "Nơi ở hiện nay (khai nếu khác địa chỉ liên lạc trong nước)" }, box: b(2, 127, 368.6, 541, 379.4), style: "text", maxLines: 1 },
      { kind: "text", id: "phone", no: "4.3", label: { ko: "휴대전화 또는 일반전화", vi: "Số điện thoại di động hoặc số điện thoại bàn" }, box: b(2, 62, 393, 375, 403.2), style: "text", required: true },
      { kind: "text", id: "email", no: "4.4", label: { ko: "전자우편", vi: "E-mail" }, box: b(2, 381, 393, 541, 403.2), style: "text", required: true },
      { kind: "text", id: "emergencyName", no: "4.5 a)", label: { ko: "비상시 연락처 — 성명", vi: "Số liên lạc khẩn cấp — Họ và tên" }, box: b(2, 147, 420, 297, 434.2), style: "name", required: true },
      { kind: "text", id: "emergencyCountry", no: "4.5 b)", label: { ko: "비상시 연락처 — 거주 국가", vi: "Số liên lạc khẩn cấp — Quốc gia cư trú" }, box: b(2, 435, 420, 541, 434.2), style: "text", required: true },
      { kind: "text", id: "emergencyPhone", no: "4.5 c)", label: { ko: "비상시 연락처 — 전화번호", vi: "Số liên lạc khẩn cấp — Số điện thoại" }, box: b(2, 181, 435.6, 297, 450.2), style: "text", required: true },
      { kind: "text", id: "emergencyRelation", no: "4.5 d)", label: { ko: "비상시 연락처 — 관계", vi: "Số liên lạc khẩn cấp — Quan hệ" }, box: b(2, 382, 435.6, 541, 450.2), style: "text", required: true },
    ],
  },
  {
    id: "s5",
    title: { ko: "5. 혼인사항 및 가족사항", vi: "5. Thông tin tình trạng hôn nhân và gia đình" },
    fields: [
      { kind: "choice", id: "marital", no: "5.1", label: { ko: "현재 혼인사항", vi: "Tình trạng hôn nhân hiện tại" }, required: true, options: [
        { value: "married", label: { ko: "기혼", vi: "Đã kết hôn" }, mark: { page: 2, x: 173.5, y: 497.5 } },
        { value: "divorced", label: { ko: "이혼", vi: "Ly hôn" }, mark: { page: 2, x: 331.6, y: 497.5 } },
        { value: "single", label: { ko: "미혼", vi: "Độc thân" }, mark: { page: 2, x: 497.1, y: 497.5 } },
      ] },
      { kind: "text", id: "spouseSurname", no: "5.2 a)", label: { ko: "배우자 — 성", vi: "Vợ/chồng — Họ" }, box: b(2, 111, 532, 298, 550.5), style: "name", required: true, when: { field: "marital", is: ["married"] } },
      { kind: "text", id: "spouseGivenName", no: "5.2 b)", label: { ko: "배우자 — 명", vi: "Vợ/chồng — Tên và chữ lót" }, box: b(2, 400, 532, 541, 550.5), style: "name", required: true, when: { field: "marital", is: ["married"] } },
      { kind: "date", id: "spouseBirth", no: "5.2 c)", label: { ko: "배우자 — 생년월일", vi: "Vợ/chồng — Ngày tháng năm sinh" }, order: "ymd", slots: { page: 2, top: 555.5, bottom: 567, y: [214.5, 229.6], m: [237, 253.9], d: [261.2, 278.3] }, required: true, when: { field: "marital", is: ["married"] } },
      { kind: "text", id: "spouseNationality", no: "5.2 d)", label: { ko: "배우자 — 국적", vi: "Vợ/chồng — Quốc tịch" }, box: b(2, 391, 552.2, 541, 571), style: "text", required: true, when: { field: "marital", is: ["married"] } },
      { kind: "text", id: "spouseAddress", no: "5.2 e)", label: { ko: "배우자 — 거주지", vi: "Vợ/chồng — Nơi cư trú" }, box: b(2, 157, 572.2, 298, 591.2), style: "text", required: true, when: { field: "marital", is: ["married"] } },
      { kind: "text", id: "spousePhone", no: "5.2 f)", label: { ko: "배우자 — 연락처", vi: "Vợ/chồng — Số liên lạc" }, box: b(2, 400, 572.2, 541, 591.2), style: "text", required: true, when: { field: "marital", is: ["married"] } },
      { kind: "choice", id: "children", no: "5.3", label: { ko: "자녀 유무", vi: "Người xin cấp visa có con hay không?" }, required: true, options: [
        { value: "no", label: { ko: "없음", vi: "Không" }, mark: { page: 2, x: 166.2, y: 617.3 } },
        { value: "yes", label: { ko: "있음", vi: "Có" }, mark: { page: 2, x: 319.6, y: 617.3 } },
      ] },
      { kind: "text", id: "childrenCount", no: "5.3", label: { ko: "자녀수", vi: "Số con" }, box: b(2, 488.3, 612.6, 498.7, 622), style: "digits", required: true, when: yes("children") },
    ],
  },
  {
    id: "s6",
    title: { ko: "6. 학력", vi: "6. Học vấn" },
    fields: [
      { kind: "choice", id: "education", no: "6.1", label: { ko: "최종학력", vi: "Bằng cấp cao nhất" }, required: true, options: [
        { value: "graduate", label: { ko: "석사/박사", vi: "Thạc sĩ/Tiến sĩ" }, mark: { page: 2, x: 239.8, y: 672 } },
        { value: "bachelor", label: { ko: "대졸", vi: "Cử nhân" }, mark: { page: 2, x: 455.6, y: 672 } },
        { value: "highschool", label: { ko: "고졸", vi: "Trung học Phổ thông" }, mark: { page: 2, x: 241.3, y: 687.5 } },
        { value: "other", label: { ko: "기타", vi: "Khác" }, mark: { page: 2, x: 452.2, y: 687.5 } },
      ] },
      { kind: "text", id: "educationOther", no: "6.1", label: { ko: "최종학력 '기타' 상세내용", vi: "Bằng cấp 'Khác' — cụ thể" }, box: b(2, 337, 697.6, 490, 707.6), style: "text", required: true, when: { field: "education", is: ["other"] } },
      { kind: "text", id: "schoolName", no: "6.2", label: { ko: "학교명", vi: "Tên trường" }, box: b(2, 160, 710.5, 277.5, 733.4), style: "text", required: true },
      { kind: "text", id: "schoolAddress", no: "6.3", label: { ko: "학교 소재지", vi: "Địa chỉ trường" }, box: b(2, 419, 710.5, 541, 733.4), style: "text", required: true },
    ],
  },
  {
    id: "s7",
    title: { ko: "7. 직업", vi: "7. Nghề nghiệp" },
    fields: [
      { kind: "choice", id: "job", no: "7.1", label: { ko: "직업", vi: "Nghề nghiệp hiện tại" }, required: true, options: [
        { value: "business", label: { ko: "사업가", vi: "Doanh nhân" }, mark: { page: 3, x: 205.9, y: 113.1 } },
        { value: "selfEmployed", label: { ko: "자영업자", vi: "Hộ kinh doanh cá thể" }, mark: { page: 3, x: 367.3, y: 112.5 } },
        { value: "employee", label: { ko: "직장인", vi: "Nhân viên" }, mark: { page: 3, x: 529.1, y: 112.5 } },
        { value: "publicServant", label: { ko: "공무원", vi: "Công chức" }, mark: { page: 3, x: 205.9, y: 129.3 } },
        { value: "student", label: { ko: "학생", vi: "Học sinh" }, mark: { page: 3, x: 367.1, y: 129.3 } },
        { value: "retired", label: { ko: "퇴직자", vi: "Đã nghỉ hưu" }, mark: { page: 3, x: 529.1, y: 129.6 } },
        { value: "unemployed", label: { ko: "무직", vi: "Thất nghiệp" }, mark: { page: 3, x: 205.9, y: 142.5 } },
        { value: "other", label: { ko: "기타", vi: "Khác" }, mark: { page: 3, x: 367.1, y: 142.5 } },
      ] },
      { kind: "text", id: "jobOther", no: "7.1", label: { ko: "직업 '기타' 상세내용", vi: "Nghề nghiệp 'Khác' — cụ thể" }, box: b(3, 346.5, 154.5, 488.5, 164.5), style: "text", required: true, when: { field: "job", is: ["other"] } },
      { kind: "text", id: "workName", no: "7.2 a)", label: { ko: "회사/기관/학교명", vi: "Tên công ty/ Cơ quan/ Trường học" }, box: b(3, 62, 197.2, 377, 207), style: "text", required: true, when: { field: "job", not: ["", "unemployed", "retired"] } },
      { kind: "text", id: "workPosition", no: "7.2 b)", label: { ko: "직위/과정", vi: "Chức vụ/ Khóa học" }, box: b(3, 385, 197.2, 541, 207), style: "text", required: true, when: { field: "job", not: ["", "unemployed", "retired"] } },
      { kind: "text", id: "workAddress", no: "7.2 c)", label: { ko: "회사/기관/학교 주소", vi: "Địa chỉ công ty/ Cơ quan/ Trường học" }, box: b(3, 62, 221.8, 377, 231.5), style: "text", required: true, when: { field: "job", not: ["", "unemployed", "retired"] } },
      { kind: "text", id: "workPhone", no: "7.2 d)", label: { ko: "전화번호", vi: "Số điện thoại" }, box: b(3, 385, 221.8, 541, 231.5), style: "text", required: true, when: { field: "job", not: ["", "unemployed", "retired"] } },
    ],
  },
  {
    id: "s8",
    title: { ko: "8. 방문정보", vi: "8. Thông tin về chuyến đi" },
    fields: [
      { kind: "choice", id: "purpose", no: "8.1", label: { ko: "입국목적", vi: "Mục đích nhập cảnh" }, required: true, options: [
        { value: "tour", label: { ko: "관광/통과", vi: "Tham quan/Quá cảnh" }, mark: { page: 3, x: 207.3, y: 279 } },
        { value: "event", label: { ko: "행사참석", vi: "Tham dự hội nghị" }, mark: { page: 3, x: 367.1, y: 279.1 } },
        { value: "medical", label: { ko: "의료관광", vi: "Du lịch chữa bệnh" }, mark: { page: 3, x: 529.1, y: 279.1 } },
        { value: "business", label: { ko: "단기상용", vi: "Công tác" }, mark: { page: 3, x: 207.4, y: 295.7 } },
        { value: "study", label: { ko: "유학/연수", vi: "Du học/ Tu nghiệp" }, mark: { page: 3, x: 367.7, y: 295.8 } },
        { value: "work", label: { ko: "취업활동", vi: "Làm việc" }, mark: { page: 3, x: 529.5, y: 295.8 } },
        { value: "trade", label: { ko: "무역/투자/주재", vi: "Thương mại/Đầu tư/Chuyển công tác nội bộ" }, mark: { page: 3, x: 206.9, y: 324.8 } },
        { value: "family", label: { ko: "가족 또는 친지방문", vi: "Thăm thân" }, mark: { page: 3, x: 367.9, y: 319.4 } },
        { value: "marriage", label: { ko: "결혼이민", vi: "Kết hôn định cư" }, mark: { page: 3, x: 530.1, y: 319.6 } },
        { value: "diplomatic", label: { ko: "외교/공무", vi: "Ngoại giao/Công vụ" }, mark: { page: 3, x: 206.6, y: 353.8 } },
        { value: "other", label: { ko: "기타", vi: "Khác" }, mark: { page: 3, x: 367.9, y: 353.8 } },
      ] },
      { kind: "text", id: "purposeOther", no: "8.1", label: { ko: "입국목적 '기타' 상세내용", vi: "Mục đích 'Khác' — cụ thể" }, box: b(3, 335.5, 364.6, 474.5, 374.6), style: "text", required: true, when: { field: "purpose", is: ["other"] } },
      { kind: "text", id: "stayPeriod", no: "8.2", label: { ko: "체류예정기간", vi: "Thời gian dự định lưu trú" }, box: b(3, 62, 393.2, 297, 407.4), style: "text", required: true },
      { kind: "date", id: "entryDate", no: "8.3", label: { ko: "입국예정일", vi: "Ngày dự định nhập cảnh" }, order: "ymd", box: b(3, 305, 393, 541, 407.4), required: true },
      { kind: "text", id: "stayAddress", no: "8.4", label: { ko: "체류예정지(호텔 포함)", vi: "Địa chỉ lưu trú (Bao gồm khách sạn)" }, box: b(3, 62, 425.6, 377, 442), style: "text", required: true },
      { kind: "text", id: "koreaPhone", no: "8.5", label: { ko: "한국 내 연락처", vi: "Số liên hệ tại Hàn Quốc" }, box: b(3, 410, 421, 541, 442), style: "text", required: true },
      { kind: "choice", id: "visitedKorea", no: "8.6", label: { ko: "과거 5년간 한국을 방문한 경력", vi: "Người xin cấp visa có từng đến Hàn Quốc trong 5 năm gần đây không?" }, required: true, options: YES_NO(3, [151.9, 465.3], [213.6, 465.3]) },
      { kind: "text", id: "visitedKoreaCount", no: "8.6", label: { ko: "방문 횟수 (회)", vi: "Số lần" }, box: b(3, 85, 476.2, 103, 486), style: "digits", required: true, when: yes("visitedKorea") },
      { kind: "table", id: "koreaVisits", no: "8.6", label: { ko: "한국 방문 상세", vi: "Chi tiết chuyến đi Hàn Quốc" }, page: 3, required: true, when: yes("visitedKorea"),
        rows: [[511.5, 530], [530, 548], [548, 566.5], [566.5, 585], [585, 603.5]],
        columns: [
          { id: "purpose", label: { ko: "방문목적", vi: "Mục đích chuyến đi" }, x0: 58, x1: 301, type: "text" },
          { id: "period", label: { ko: "방문기간", vi: "Thời gian lưu trú" }, x0: 301, x1: 543, type: "period", order: "dmy" },
        ] },
      { kind: "choice", id: "visitedOthers", no: "8.7", label: { ko: "한국 외에 과거 5년간 여행한 국가", vi: "Người xin cấp visa có từng du lịch nước ngoài (trừ Hàn Quốc) trong 5 năm gần đây không?" }, required: true, options: YES_NO(3, [148.7, 644.2], [208.9, 644.2]) },
      { kind: "table", id: "otherTrips", no: "8.7", label: { ko: "해외 여행 상세", vi: "Chi tiết chuyến đi nước ngoài" }, page: 3, required: true, when: yes("visitedOthers"),
        rows: [[676, 691.5], [691.5, 707], [707, 722.5], [722.5, 738], [738, 754]],
        columns: [
          { id: "country", label: { ko: "국가명", vi: "Quốc gia" }, x0: 58, x1: 138.6, type: "text" },
          { id: "purpose", label: { ko: "방문목적", vi: "Mục đích nhập cảnh" }, x0: 138.6, x1: 269.4, type: "text" },
          { id: "period", label: { ko: "방문기간", vi: "Thời gian lưu trú" }, x0: 269.4, x1: 543, type: "period", order: "dmy" },
        ] },
      { kind: "choice", id: "familyInKorea", no: "8.8", label: { ko: "국내 체류 가족 유무 (배우자, 자녀, 부모, 형제)", vi: "Người xin cấp visa có người thân ở Hàn Quốc không? (Vợ/chồng, cha mẹ, con cái, anh chị em ruột)" }, required: true, options: YES_NO(4, [150.7, 92.8], [207.7, 92.8]) },
      { kind: "table", id: "familyInKoreaList", no: "8.8", label: { ko: "국내 체류 가족", vi: "Người thân ở Hàn Quốc" }, page: 4, required: true, when: yes("familyInKorea"),
        rows: [[120.5, 136.1], [136.1, 151.8], [151.8, 167.3], [167.3, 183]], columns: FAMILY_COLUMNS },
      { kind: "choice", id: "familyWith", no: "8.9", label: { ko: "동반입국 가족 유무 (배우자, 자녀, 부모, 형제)", vi: "Người xin cấp visa có đi Hàn Quốc với người thân không? (Vợ/chồng, cha mẹ, con cái, anh chị em ruột)" }, required: true, options: YES_NO(4, [157.3, 227], [219.4, 227]) },
      { kind: "table", id: "familyWithList", no: "8.9", label: { ko: "동반입국 가족", vi: "Người thân đi cùng" }, page: 4, required: true, when: yes("familyWith"),
        rows: [[266.7, 282.3], [282.3, 297.9], [297.9, 313.5], [313.5, 329.2]], columns: FAMILY_COLUMNS },
    ],
  },
  {
    id: "s9",
    title: { ko: "9. 초청 정보", vi: "9. Thông tin cá nhân/ tổ chức mời" },
    fields: [
      { kind: "choice", id: "inviter", no: "9.1", label: { ko: "초청인/초청회사", vi: "Người xin cấp visa có được cá nhân/tổ chức nào mời không?" }, required: true, options: YES_NO(4, [148.5, 402.1], [212.3, 402.1]) },
      { kind: "text", id: "inviterName", no: "9.1 a)", label: { ko: "초청인/초청회사명", vi: "Tên cá nhân/tổ chức mời" }, box: b(4, 268, 409, 541, 434), style: "text", required: true, when: yes("inviter") },
      { kind: "text", id: "inviterBirthOrRegNo", no: "9.1 b)", label: { ko: "생년월일/사업자등록번호", vi: "Ngày tháng năm sinh/Mã số doanh nghiệp" }, box: b(4, 72, 449.2, 383, 460), style: "text", required: true, when: yes("inviter") },
      { kind: "text", id: "inviterRelation", no: "9.1 c)", label: { ko: "관계", vi: "Quan hệ" }, box: b(4, 397, 449.2, 541, 460), style: "text", required: true, when: yes("inviter") },
      { kind: "text", id: "inviterAddress", no: "9.1 d)", label: { ko: "주소", vi: "Địa chỉ" }, box: b(4, 137, 461.6, 383, 485.6), style: "text", required: true, when: yes("inviter") },
      { kind: "text", id: "inviterPhone", no: "9.1 e)", label: { ko: "전화번호", vi: "Điện thoại" }, box: b(4, 397, 474.6, 541, 485.6), style: "text", required: true, when: yes("inviter") },
    ],
  },
  {
    id: "s10",
    title: { ko: "10. 방문경비", vi: "10. Kinh phí chuyến đi" },
    fields: [
      { kind: "text", id: "costUsd", no: "10.1", label: { ko: "방문경비(미국 달러 기준)", vi: "Kinh phí dự tính (theo đơn vị đô la Mỹ)" }, box: b(4, 366, 511, 541, 536.5), style: "digits", suffix: " USD", required: true },
      { kind: "text", id: "payerName", no: "10.2 a)", label: { ko: "경비지급자 — 성명/회사(단체)명", vi: "Người chi trả — Họ và tên/ Tên công ty (tổ chức)" }, box: b(4, 72, 579, 383, 589), style: "text", required: true },
      { kind: "text", id: "payerRelation", no: "10.2 b)", label: { ko: "경비지급자 — 관계", vi: "Người chi trả — Quan hệ" }, box: b(4, 463, 565, 541, 589), style: "text", required: true },
      { kind: "text", id: "payerSupport", no: "10.2 c)", label: { ko: "경비지급자 — 지원내용", vi: "Người chi trả — Nội dung chi trả" }, box: b(4, 193, 591, 383, 614), style: "text", required: true },
      { kind: "text", id: "payerContact", no: "10.2 d)", label: { ko: "경비지급자 — 연락처", vi: "Người chi trả — Số liên hệ" }, box: b(4, 397, 604.4, 541, 614), style: "text", required: true },
    ],
  },
  {
    id: "s11",
    title: { ko: "11. 서류 작성 시 도움 여부", vi: "11. Trợ giúp khai đơn" },
    fields: [
      { kind: "choice", id: "helped", no: "11.1", label: { ko: "이 신청서를 작성하는데 다른 사람의 도움을 받았습니까?", vi: "Người xin cấp visa có nhận sự giúp đỡ từ người khác khi khai đơn này không?" }, required: true, options: YES_NO(4, [181.7, 656.9], [236.1, 656.9]) },
      { kind: "table", id: "helper", no: "11.1", label: { ko: "도움을 준 사람", vi: "Thông tin người giúp đỡ" }, page: 4, required: true, when: yes("helped"),
        rows: [[686.5, 715.7]],
        columns: [
          { id: "name", label: { ko: "성명", vi: "Họ và tên" }, x0: 58, x1: 231.5, type: "name" },
          { id: "birth", label: { ko: "생년월일", vi: "Ngày tháng năm sinh" }, x0: 231.5, x1: 336, type: "date", order: "ymd" },
          { id: "phone", label: { ko: "연락처", vi: "Điện thoại" }, x0: 336, x1: 436.8, type: "text" },
          { id: "relation", label: { ko: "관계", vi: "Quan hệ" }, x0: 436.8, x1: 543, type: "text" },
        ] },
    ],
  },
  {
    id: "s12",
    title: { ko: "12. 서약", vi: "12. Cam kết" },
    fields: [
      { kind: "date", id: "applicationDate", no: "12", label: { ko: "신청일자 (년. 월. 일)", vi: "Ngày đăng ký" }, order: "ymd", slots: { page: 5, top: 541, bottom: 552.5, y: [150, 192.5], m: [201.5, 233], d: [241.5, 273.5] }, required: true },
    ],
  },
];

/** 12 서약의 '신청인 성명'은 1.1에서 자동으로 채운다 (서명은 비움) */
export const APPLICANT_NAME_BOX: Box = b(5, 250, 559.5, 359, 570);

/** 서식 1~5쪽 위쪽 여백에 넣는 초안 표시 */
export const DRAFT_NOTE = "초안 / BẢN NHÁP — 본인이 확인·서명 후 직접 제출 / Tự kiểm tra, ký tên và tự nộp";

export const ALL_FIELDS: Field[] = VISA17.flatMap((s) => s.fields);

export function isVisible(field: Field, values: FormValues): boolean {
  if (!field.when) return true;
  const v = typeof values[field.when.field] === "string" ? (values[field.when.field] as string) : "";
  return "is" in field.when ? field.when.is.includes(v) : !field.when.not.includes(v);
}
