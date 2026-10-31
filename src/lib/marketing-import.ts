// Import zadań/treści/planów marketingowych z pliku tekstowego (.txt/.md) —
// np. notatki wyeksportowane z innej rozmowy AI, żeby nie przepisywać ich
// ręcznie. Plik ma wypełniony IMPORT_TEMPLATE (dajemy go userowi do
// skopiowania do tamtej rozmowy), ale parser jest celowo wyrozumiały —
// to pełny odczyt przez model, nie sztywny regex, więc drobne odstępstwa od
// szablonu (inna kolejność, brakujące pole, luźniejsza forma) nie wywalają
// całego importu.

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "./ai";

export const IMPORT_TEMPLATE = `# Import do systemu marketingu City Sports

Wypełnij poniższe sekcje tym, co ustaliliśmy w tej rozmowie. Możesz pominąć
całą sekcję albo pojedyncze pola, jeśli czegoś nie ma — system poradzi sobie
z brakami. Każdy wpis zaczyna się od nagłówka "### ".

## Zadania

### Tytuł zadania
- Opis: opcjonalny, dłuższy opis
- Priorytet: niski / normalny / wysoki
- Termin: RRRR-MM-DD
- Osoba: Imię Nazwisko

## Treści (kalendarz)

### Tytuł treści
- Platforma: Instagram / Facebook / Strona WWW / E-mail / Inne
- Cel: Promocja / Relacja
- Data publikacji: RRRR-MM-DD
- Status: Pomysł / W przygotowaniu / Gotowe / Opublikowane
- Osoba: Imię Nazwisko
- Notatki: opcjonalne

## Plany i strategie

### Tytuł dokumentu
- Typ: Strategia / Plan
- Treść:
  Dowolny, dłuższy tekst — może być kilka akapitów.
`;

export type ExtractedTask = {
  title: string;
  description?: string;
  priority?: "low" | "normal" | "high";
  due_date?: string;
  assignee_name?: string;
};
export type ExtractedContent = {
  title: string;
  platform?: "instagram" | "facebook" | "strona_www" | "email" | "inne";
  purpose?: "promocja" | "relacja";
  scheduled_date?: string;
  status?: "pomysl" | "w_przygotowaniu" | "gotowe" | "opublikowane";
  notes?: string;
  assignee_name?: string;
};
export type ExtractedPlan = {
  title: string;
  type?: "strategia" | "plan";
  body?: string;
};
export type ExtractedImport = {
  tasks: ExtractedTask[];
  content: ExtractedContent[];
  plans: ExtractedPlan[];
};

const IMPORT_TOOL: Anthropic.Tool = {
  name: "import_marketing_data",
  description: "Zadania, treści do kalendarza i plany/strategie wyciągnięte z dostarczonego pliku.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        description: "Konkretne, pojedyncze rzeczy do zrobienia (nie pomysły czy plany ogólne).",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["low", "normal", "high"], description: "low=niski, normal=normalny, high=wysoki. Domyślnie normal." },
            due_date: { type: "string", description: "Format RRRR-MM-DD, pomiń pole jeśli nie podano terminu." },
            assignee_name: { type: "string", description: "Imię i nazwisko osoby odpowiedzialnej, dokładnie jak w tekście. Pomiń jeśli nie podano." },
          },
          required: ["title"],
        },
      },
      content: {
        type: "array",
        description: "Konkretne publikacje/posty z datą publikacji — do kalendarza treści.",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            platform: { type: "string", enum: ["instagram", "facebook", "strona_www", "email", "inne"], description: "Domyślnie inne, jeśli nie podano." },
            purpose: {
              type: "string",
              enum: ["promocja", "relacja"],
              description: "promocja=reklama konkretnej usługi/trenera, relacja=zwykła relacja z życia klubu. Domyślnie relacja, jeśli nie podano.",
            },
            scheduled_date: { type: "string", description: "Format RRRR-MM-DD — WYMAGANE dla każdej treści, bez daty wpis zostanie pominięty." },
            status: {
              type: "string",
              enum: ["pomysl", "w_przygotowaniu", "gotowe", "opublikowane"],
              description: "pomysl=Pomysł, w_przygotowaniu=W przygotowaniu, gotowe=Gotowe, opublikowane=Opublikowane. Domyślnie pomysl.",
            },
            notes: { type: "string" },
            assignee_name: { type: "string", description: "Imię i nazwisko osoby odpowiedzialnej, dokładnie jak w tekście. Pomiń jeśli nie podano." },
          },
          required: ["title", "scheduled_date"],
        },
      },
      plans: {
        type: "array",
        description: "Dłuższe, swobodne dokumenty — strategie, plany kampanii, nie pojedyncze zadania czy posty.",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: { type: "string", enum: ["strategia", "plan"], description: "Domyślnie plan, jeśli nie podano." },
            body: { type: "string" },
          },
          required: ["title"],
        },
      },
    },
    required: ["tasks", "content", "plans"],
  },
};

const SYSTEM_PROMPT = `Wyciągasz strukturalne dane marketingowe (zadania, wpisy do kalendarza treści, plany/strategie) z dostarczonego tekstu — notatek lub zapisu rozmowy, które ktoś przygotował do zaimportowania do systemu City Sports. Tekst zwykle luźno trzyma się przekazanego mu szablonu, ale może od niego odbiegać (inna kolejność, brakujące pola, inne słowa) — i tak wyciągnij z niego sensowną treść.

Rozróżniaj: ZADANIA to konkretne, pojedyncze rzeczy do zrobienia bez stałej daty publikacji. TREŚCI to konkretne posty/publikacje z datą — jeśli coś ma wyraźną datę publikacji na konkretnym kanale, to treść, nie zadanie. PLANY to dłuższe, swobodne dokumenty (strategia, plan kampanii), nie pojedyncze działania.

Nie zmyślaj pól, których nie ma w tekście — po prostu je pomiń. Odpowiadaj WYŁĄCZNIE przez narzędzie import_marketing_data.`;

export async function extractMarketingImport(fileText: string): Promise<ExtractedImport> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    // 8000 było za mało dla większego pliku (np. kilkanaście zadań + kilka
    // dłuższych strategii naraz) — model ucinał odpowiedź w połowie
    // generowania tool_use, a input.tasks/input.plans po prostu nie istniały
    // w obciętym JSON-ie, więc treści importowały się OK, a zadania i plany
    // z TEGO SAMEGO pliku znikały bez żadnego błędu (patrz sprawdzenie
    // stop_reason niżej — teraz to wykrywa zamiast cicho gubić dane).
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    tools: [IMPORT_TOOL],
    messages: [{ role: "user", content: fileText }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Plik jest za duży/złożony — AI nie zdążyło przetworzyć wszystkiego do końca (ucięte w połowie). Podziel plik na mniejsze części (np. osobno zadania, osobno treści, osobno plany) i wrzuć każdą osobno."
    );
  }

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "import_marketing_data");
  if (!toolUse) {
    throw new Error("AI nie zwróciło wyniku importu — spróbuj ponownie albo sprawdź treść pliku.");
  }
  const input = toolUse.input as Partial<ExtractedImport>;
  return {
    tasks: Array.isArray(input.tasks) ? input.tasks : [],
    content: Array.isArray(input.content) ? input.content : [],
    plans: Array.isArray(input.plans) ? input.plans : [],
  };
}
