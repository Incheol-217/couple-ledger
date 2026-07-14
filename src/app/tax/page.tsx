import { redirect } from "next/navigation";

// 보고서와 연말정산은 '분석' 한 화면(연말정산 탭)으로 합쳐졌어요.
export default function TaxPage() {
  redirect("/reports?view=tax");
}
