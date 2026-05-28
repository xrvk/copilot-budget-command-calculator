/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_ENTERPRISE_URL?: string
  readonly VITE_DEV_PAT?: string
  readonly VITE_DEV_ENTERPRISE_URL_2?: string
  readonly VITE_DEV_PAT_2?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
