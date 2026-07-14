import { redirect } from "next/navigation";

// 자산·부채는 한 화면(자산 탭)으로 합쳐졌어요. 옛 주소는 그리로 보내요.
export default function DebtsPage() {
  redirect("/invest?view=debts");
}
