import Anthropic from "@anthropic-ai/sdk";

// Wąska, kontrolowana warstwa AI — wywoływana tylko z konkretnych, ograniczonych
// miejsc (pytania o grafik w naturalnym języku, podsumowania). NIGDY do
// deterministycznej logiki (układanie grafiku, wynagrodzenia) — to zostaje
// zwykłym kodem z regułami.
export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Brak klucza ANTHROPIC_API_KEY — asystent AI nie jest jeszcze skonfigurowany. Poproś administratora o dodanie klucza."
    );
  }
  return new Anthropic({ apiKey });
}

// Prosta odpowiedź tekstowa na jedno pytanie z podanym kontekstem — używane
// do pytań o grafik/zadania w naturalnym języku. Model odpowiada WYŁĄCZNIE
// na podstawie przekazanych danych, nie podejmuje żadnych akcji.
export async function askWithContext(system: string, question: string, context: string): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    // Sonnet 5: te wywołania tylko przerabiają gotowe, deterministycznie
    // wyliczone dane na kilka zdań tekstu (notatki, podsumowania) — nie
    // wymagają mocy Opusa.
    model: "claude-sonnet-5",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: `${context}\n\nPytanie: ${question}` }],
  });

  if (response.stop_reason === "refusal") {
    return "Nie mogę odpowiedzieć na to pytanie.";
  }

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "Brak odpowiedzi.";
}
