export type Bindings = {
  DB: D1Database;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  OPENROUTER_API_KEY: string;
  APP_ENV: string;
  CORS_ORIGIN: string;
  AI_BASE_URL: string;
  AI_MODEL_PRIMARY: string;
  AI_MODEL_FALLBACK: string;
  BACKOFFICE_SECRET?: string;
};

export type AppVariables = {
  userId: string;
  role: 'therapist' | 'client' | 'admin';
};
