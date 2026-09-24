// Zabezpieczenie endpointów wywoływanych przez Vercel Cron — Vercel wysyła
// nagłówek Authorization: Bearer <CRON_SECRET> automatycznie przy zadaniach
// zdefiniowanych w vercel.json. Bez poprawnego sekretu nikt z zewnątrz nie
// może wyzwolić tych automatyzacji ręcznie.
export function assertCronSecret(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("Brak CRON_SECRET w konfiguracji serwera.");
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new Error("Nieautoryzowane.");
  }
}
