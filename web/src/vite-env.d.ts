/// <reference types="vite/client" />

// Variables from .env files / the environment; only names starting with VITE_ reach the browser code.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
