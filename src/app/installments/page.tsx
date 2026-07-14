import { redirect } from "next/navigation";

// 고정비와 할부는 '정기지출' 한 화면(할부 탭)으로 합쳐졌어요.
export default function InstallmentsPage() {
  redirect("/recurring?view=installments");
}
