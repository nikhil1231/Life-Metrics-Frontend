/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_SPREADSHEET_ID?: string;
  readonly VITE_SHEET_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
