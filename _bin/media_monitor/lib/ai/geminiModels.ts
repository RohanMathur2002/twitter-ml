export const GEMINI_MODEL_OPTIONS = [
  // v1 models (available for generateContent)
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash (001)" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  { value: "gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash Lite (001)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },

  // v1beta models (Gemini 3 flash variants)
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
  { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (Preview)" },
] as const;

export type GeminiModel = (typeof GEMINI_MODEL_OPTIONS)[number]["value"];

export const DEFAULT_GEMINI_MODEL: GeminiModel = "gemini-2.5-flash";
