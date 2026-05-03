import { z } from 'zod';

export const apiKeysSchema = z.record(z.string(), z.string());

export const providerSchema = z.enum(['kimi', 'grok', 'openai', 'deepseek', 'google', 'ollama', 'custom']);

export const searchProviderSchema = z.enum(['brave', 'tavily']);

export const searchSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: searchProviderSchema,
  apiKey: z.string(),
});

export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  tone: z.string(),
  accent: z.string(),
  replyLength: z.string(),
  useCustomPrompt: z.boolean(),
  customPrompt: z.string(),
});

export const settingsSchema = z.object({
  apiProvider: providerSchema.catch('kimi'),
  apiKeys: apiKeysSchema.catch({}),
  apiKey: z.string().optional(),
  tone: z.string().catch('diplomatic'),
  accent: z.string().catch('neutral'),
  replyLength: z.string().catch('medium'),
  customPrompt: z.string().optional(),
  useCustomPrompt: z.boolean().catch(false),
  customBaseUrl: z.string().optional(),
  customModel: z.string().optional(),
  customSupportsVision: z.boolean().catch(false),
  variations: z.boolean().catch(false),
  streaming: z.boolean().catch(false),
  searchEnabled: z.boolean().catch(false),
  searchProvider: searchProviderSchema.catch('brave'),
  searchApiKey: z.string().catch(''),
  monitorMode: z.boolean().catch(false),
  keywords: z.string().catch(''),
  platformX: z.boolean().catch(true),
  platformFacebook: z.boolean().catch(true),
  enabled: z.boolean().catch(true),
  personas: z.array(personaSchema).optional(),
  locale: z.enum(['en', 'ar']).catch('en'),
});

export type ValidatedSettings = z.infer<typeof settingsSchema>;

/**
 * Validate storage.local data against schemas.
 * Returns { success: true, data } or { success: false, defaults }.
 */
export function validateStorage(data: unknown): {
  success: boolean;
  data: ValidatedSettings;
} {
  const parsed = settingsSchema.safeParse(data);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  // Return defaults on failure
  const defaults = settingsSchema.parse({});
  console.warn('[X Reply Gen] Storage validation failed, using defaults:', parsed.error?.message);
  return { success: false, data: defaults };
}
