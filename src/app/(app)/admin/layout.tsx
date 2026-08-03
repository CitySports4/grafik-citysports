import { redirect } from "next/navigation";
import { getSessionEmployee } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const employee = await getSessionEmployee();
  if (!employee || employee.role !== "admin") {
    redirect("/grafik");
  }

  return <div className="flex flex-col gap-6">{children}</div>;
}
