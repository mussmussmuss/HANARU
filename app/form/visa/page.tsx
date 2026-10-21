import type { Metadata } from "next";
import VisaForm from "@/components/forms/VisaForm";

export const metadata: Metadata = { title: "HANARU · Đơn xin cấp visa (bản nháp)" };

export default function Page() {
  return <VisaForm />;
}
