import Link from "next/link";

export function ModuleArchived({ name }: { name: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <h1 className="text-lg font-bold text-zinc-900">{name}</h1>
      <p className="text-sm text-zinc-600">Ten moduł jest chwilowo wyłączony. Wróci, gdy zdecydujemy o jego dalszym kształcie.</p>
      <Link href="/grafik" className="text-sm font-semibold text-brand-blue hover:underline">← Wróć do grafiku</Link>
    </div>
  );
}
