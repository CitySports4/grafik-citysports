import { redirect } from "next/navigation";
import { getSessionEmployee } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const employee = await getSessionEmployee();
  if (employee) {
    redirect("/grafik");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <LoginForm />
    </main>
  );
}
