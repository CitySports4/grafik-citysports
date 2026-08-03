// Normalizuje numer telefonu do samych cyfr, żeby "663 191 440",
// "663-191-440" i "663191440" trafiały na to samo konto przy logowaniu.
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
