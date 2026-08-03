import { redirect } from "next/navigation";
import { getSessionEmployee } from "@/lib/session";

export default async function HomePage() {
  const employee = await getSessionEmployee();
  redirect(employee ? "/grafik" : "/login");
}
