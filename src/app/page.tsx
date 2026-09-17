import { redirect } from "next/navigation";
import { getSessionEmployee, isPersonalTrainerOnly } from "@/lib/session";

export default async function HomePage() {
  const employee = await getSessionEmployee();
  if (!employee) redirect("/login");
  // Ktoś wyłącznie z rolą trenera personalnego nie ma "swojego grafiku"
  // zmian — od razu ląduje na grafiku treningów, patrz (app)/layout.tsx.
  redirect(isPersonalTrainerOnly(employee) ? "/treningi-personalne" : "/grafik");
}
