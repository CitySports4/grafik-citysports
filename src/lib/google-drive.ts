// Upload załączników Kasy (paragony, skany) na firmowy Google Drive —
// ustalone z userem zamiast Supabase Storage, żeby księgowa dostała zwykły,
// udostępniony folder Drive, a nie osobne konto w systemie.
//
// WYMAGA konfiguracji (zmienne środowiskowe w Vercel), bez tego rzuca
// czytelny błąd zamiast ciszej awarii:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL     — adres konta serwisowego z Google Cloud
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — jego klucz prywatny (PEM, z \n)
//   GOOGLE_DRIVE_ROOT_FOLDER_ID      — ID folderu "Kasa" na firmowym Dysku,
//                                      udostępnionego kontu serwisowemu z
//                                      prawem Edytora
//
// Podpis JWT ręcznie przez node:crypto (RS256) zamiast doinstalowywać
// googleapis/jsonwebtoken — ten sam styl co HMAC w lib/session.ts, appka
// celowo trzyma się bez ciężkich zależności do rzeczy, które da się zrobić
// kilkunastoma liniami.

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Brak konfiguracji Google Drive: ustaw zmienną środowiskową ${name} w Vercel.`);
  return value;
}

async function getAccessToken(): Promise<string> {
  const { createSign } = await import("node:crypto");
  const clientEmail = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  // Klucz w zmiennej środowiskowej ma dosłowne "\n" zamiast prawdziwych
  // znaków nowej linii (tak Vercel/większość hostingów każe wklejać PEM) —
  // trzeba je odtworzyć przed użyciem.
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(privateKey));
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Logowanie do Google Drive nie powiodło się (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Znajduje podfolder o danej nazwie wewnątrz parentId, a jeśli go nie ma —
// tworzy go. Wywoływane sekwencyjnie po segmentach ścieżki (patrz
// ensureFolderPath) — niewielki narzut requestów, akceptowalny bo upload
// jest akcją z ręcznym kliknięciem, nie hot pathem.
async function ensureFolder(accessToken: string, parentId: string, name: string): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'");
  const query = `'${parentId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Nie udało się sprawdzić folderu Drive "${name}" (${listRes.status}).`);
  const listData = (await listRes.json()) as { files: { id: string }[] };
  if (listData.files.length > 0) return listData.files[0].id;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!createRes.ok) throw new Error(`Nie udało się utworzyć folderu Drive "${name}" (${createRes.status}).`);
  const createData = (await createRes.json()) as { id: string };
  return createData.id;
}

async function ensureFolderPath(accessToken: string, rootId: string, segments: string[]): Promise<string> {
  let parentId = rootId;
  for (const segment of segments) {
    parentId = await ensureFolder(accessToken, parentId, segment);
  }
  return parentId;
}

export type DriveUploadResult = { fileId: string; webViewLink: string };

// folderSegments np. ["2026", "11", "KW"] — budowane pod GOOGLE_DRIVE_ROOT_FOLDER_ID
// (ten folder to "Kasa" na Dysku firmowym, już udostępniony księgowej).
export async function uploadToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderSegments: string[]
): Promise<DriveUploadResult> {
  const accessToken = await getAccessToken();
  const rootId = requireEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID");
  const folderId = await ensureFolderPath(accessToken, rootId, folderSegments);

  const boundary = `kasa-${Date.now()}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!uploadRes.ok) throw new Error(`Przesyłanie pliku na Google Drive nie powiodło się (${uploadRes.status}): ${await uploadRes.text()}`);
  const data = (await uploadRes.json()) as { id: string; webViewLink: string };
  return { fileId: data.id, webViewLink: data.webViewLink };
}
