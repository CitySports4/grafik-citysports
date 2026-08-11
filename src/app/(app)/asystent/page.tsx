import { Card } from "@/components/Card";
import { AssistantChat } from "./AssistantChat";

export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Asystent</h1>
        <p className="text-sm text-zinc-500">
          Zapytaj o grafik w naturalnym języku (np. &quot;kto ma jutro zmianę?&quot;). Odpowiada
          wyłącznie na podstawie opublikowanego grafiku najbliższych 14 dni — nie zmienia żadnych
          danych.
        </p>
      </div>
      <Card>
        <AssistantChat />
      </Card>
    </div>
  );
}
