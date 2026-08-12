export type AppConfig = {
  googleClientId: string;
  spreadsheetId: string;
  sheetName: string;
  errors: string[];
};

export const getAppConfig = (
  env: Partial<ImportMetaEnv> = import.meta.env,
): AppConfig => {
  const googleClientId = env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
  const spreadsheetId = env.VITE_SPREADSHEET_ID?.trim() ?? "";
  const sheetName = env.VITE_SHEET_NAME?.trim() || "Main";
  const errors: string[] = [];

  if (!googleClientId) errors.push("VITE_GOOGLE_CLIENT_ID is missing.");
  if (!spreadsheetId) errors.push("VITE_SPREADSHEET_ID is missing.");

  return { googleClientId, spreadsheetId, sheetName, errors };
};

export const APP_CONFIG = getAppConfig();
