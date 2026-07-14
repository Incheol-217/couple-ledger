import { redirect } from "next/navigation";

// 예산과 저축 목표는 '예산·목표' 한 화면(저축 탭)으로 합쳐졌어요.
export default function GoalsPage() {
  redirect("/budgets?view=goals");
}
