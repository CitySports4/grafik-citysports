"use server";

import { requireAdmin } from "@/lib/session";
import { runAiCleaningPlan } from "@/lib/cleaning-generator-ai";

// AI ma tu pełne zaufanie do wyboru dnia dla zadań cyklicznych — patrz
// komentarz na górze cleaning-generator-ai.ts po uzasadnienie i zabezpieczenia
// (każdy wybór jest rewalidowany przy każdym odczycie w cleaning.ts, nigdy
// ślepo zaufany).
export async function planCleaningWithAi(dateKeys: string[]): Promise<{ decidedCount: number; consideredCount: number }> {
  await requireAdmin();
  return runAiCleaningPlan(dateKeys);
}
