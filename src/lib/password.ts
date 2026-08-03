// Wymogi hasła: min. 6 znaków, przynajmniej jedna wielka litera,
// jedna mała litera i jedna cyfra. Znaki specjalne nie są wymagane.
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

export const PASSWORD_HINT =
  "Min. 6 znaków, w tym wielka litera, mała litera i cyfra.";

export function validatePassword(password: string): string | null {
  if (!PASSWORD_RULE.test(password)) {
    return PASSWORD_HINT;
  }
  return null;
}
