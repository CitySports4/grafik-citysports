// Wysyłka wiadomości WhatsApp Business przez Meta Cloud API — na razie tylko
// powiadomienie "grafik opublikowany", ale zbudowane jako ogólna warstwa do
// dalszych powiadomień.
//
// WAŻNE — wiadomości inicjowane przez SERWER (nie odpowiedź na wiadomość,
// którą pracownik napisał w ostatnich 24h) MUSZĄ być zatwierdzonym przez
// Metę SZABLONEM (template) — zwykły dowolny tekst zostanie odrzucony przez
// WhatsApp dla tego typu wiadomości. Szablon trzeba założyć i zatwierdzić w
// Meta Business Manager (WhatsApp Manager → Message Templates) ZANIM to
// zadziała — patrz WHATSAPP_TEMPLATE_GRAFIK_OPUBLIKOWANY niżej.
//
// Wymagana konfiguracja (zmienne środowiskowe):
//   WHATSAPP_ACCESS_TOKEN     — token dostępu z Meta Business/WhatsApp Cloud API
//   WHATSAPP_PHONE_NUMBER_ID  — ID numeru nadawcy (z WhatsApp Manager)
//   WHATSAPP_TEMPLATE_GRAFIK_OPUBLIKOWANY — opcjonalnie, nazwa szablonu
//     (domyślnie "grafik_opublikowany"), gdyby nazwa zatwierdzona w Meta była inna.

const GRAPH_API_VERSION = "v21.0";
export const DEFAULT_GRAFIK_TEMPLATE_NAME = "grafik_opublikowany";

// Numery w bazie (employee.phone) służą do LOGOWANIA, nie telefonii — to
// zwykle "gołe" 9-cyfrowe polskie numery bez numeru kierunkowego (patrz
// normalizePhone w src/lib/phone.ts). WhatsApp Cloud API wymaga pełnego
// numeru z numerem kierunkowym (bez wiodącego +) — dopisujemy 48, jeśli
// numer wygląda na krajowy 9-cyfrowy.
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) return `48${digits}`;
  return digits;
}

export type WhatsAppSendResult = { to: string; ok: boolean; error?: string };

async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  languageCode: string
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { to, ok: false, error: "Brak WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID w konfiguracji serwera." };
  }

  const waNumber = toWhatsAppNumber(to);
  const body = {
    messaging_product: "whatsapp",
    to: waNumber,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams.length > 0
        ? { components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { to, ok: false, error: `WhatsApp API ${res.status}: ${errText.slice(0, 300)}` };
    }
    return { to, ok: true };
  } catch (err) {
    return { to, ok: false, error: err instanceof Error ? err.message : "Nieznany błąd wysyłki WhatsApp." };
  }
}

// Rozsyła jeden szablon do wielu numerów naraz — zbiera wynik per numer
// zamiast przerywać całość na pierwszym niepowodzeniu (jeden zły numer albo
// ktoś bez WhatsApp nie powinien blokować powiadomienia dla reszty zespołu).
export async function broadcastWhatsAppTemplate(
  recipients: string[],
  templateName: string,
  bodyParams: string[] = [],
  languageCode = "pl"
): Promise<{ sent: number; failed: WhatsAppSendResult[] }> {
  if (recipients.length === 0) return { sent: 0, failed: [] };
  const results = await Promise.all(recipients.map((to) => sendWhatsAppTemplate(to, templateName, bodyParams, languageCode)));
  const failed = results.filter((r) => !r.ok);
  return { sent: results.length - failed.length, failed };
}
