import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { HarborError } from '@harbor/core';
import type { ModelUsage } from './types.ts';

/**
 * The model providers Harbor supports and one small adapter per provider. Every Harbor AI feature asks for JSON that
 * matches a schema; each adapter uses its provider's native structured-output mode and reports token usage, so the
 * features above it don't care which provider ran.
 */

export const PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface CatalogModel {
  id: string;
  label: string;
  /** What it's for, in a few words. */
  note: string;
  /** List price per million tokens, when known. */
  price?: { input: number; output: number };
}

/**
 * The models Harbor offers per provider, best first. The first is the provider's default. IDs follow each provider's
 * own docs (2026-11-16); any other model id the provider accepts can also be set.
 */
export const CATALOG: Record<Provider, { name: string; envKeys: string[]; models: CatalogModel[] }> = {
  anthropic: {
    name: 'Anthropic',
    envKeys: ['ANTHROPIC_API_KEY'],
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best quality for writing and building', price: { input: 4, output: 20 } },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Fast and capable, lower cost', price: { input: 2, output: 10 } },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest and cheapest', price: { input: 0.1, output: 0.5 } },
    ],
  },
  openai: {
    name: 'OpenAI',
    envKeys: ['OPENAI_API_KEY'],
    models: [
      { id: 'gpt-6-astra', label: 'GPT-6 Astra', note: "OpenAI's flagship" },
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', note: 'Close to Astra, lower cost' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', note: 'Most efficient, high volume' },
    ],
  },
  google: {
    name: 'Google',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    models: [{ id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: "Google's most capable model" }],
  },
};

export const defaultModelFor = (p: Provider) => CATALOG[p].models[0]!.id;

export interface LlmRequest {
  system: string;
  prompt: string;
  /** The JSON shape the answer must have (a JSON Schema object). */
  schema: Record<string, unknown>;
  /** A short name for the schema, e.g. "post_draft". */
  schemaName: string;
  maxTokens: number;
  /** How hard to think, where the provider supports it. */
  effort?: 'low' | 'medium' | 'high';
}

export interface LlmResponse {
  /** The JSON text the model returned. */
  text: string;
  usage: ModelUsage;
  /** The model that actually answered (a fallback can differ from the one asked). */
  model: string;
}

export interface LlmProvider {
  readonly provider: Provider;
  complete(model: string, req: LlmRequest): Promise<LlmResponse>;
}

const failed = (provider: Provider, err: unknown): never => {
  const msg = err instanceof Error ? err.message : String(err);
  throw new HarborError('UPSTREAM_ERROR', `${CATALOG[provider].name} couldn't answer: ${msg.slice(0, 300)}`);
};

// Claude Opus 5.5 and Sonnet 5.5 decline some requests through safety classifiers; server-side fallbacks re-run a
// declined request on a fallback model inside the same call (Haiku 5.5 has none).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export function anthropicProvider(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey });
  return {
    provider: 'anthropic',
    async complete(model, req) {
      let res;
      try {
        // Streamed, then collected: long agent steps (up to 32k output tokens) must stream, or the SDK refuses them.
        res = await client.beta.messages.stream({
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
          output_config: { effort: req.effort ?? 'medium', format: { type: 'json_schema', schema: req.schema } },
          ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        }).finalMessage();
      } catch (err) {
        return failed('anthropic', err);
      }
      if (res.stop_reason === 'refusal') throw new HarborError('UPSTREAM_ERROR', "Claude declined this request. Try rewording it, or another model.");
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { text, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }, model: res.model };
    },
  };
}

export function openaiProvider(apiKey: string): LlmProvider {
  const client = new OpenAI({ apiKey });
  return {
    provider: 'openai',
    async complete(model, req) {
      let res;
      try {
        res = await client.responses.create({
          model,
          instructions: req.system,
          input: req.prompt,
          max_output_tokens: req.maxTokens,
          text: { format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: false } },
        });
      } catch (err) {
        return failed('openai', err);
      }
      return { text: res.output_text, usage: { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 }, model: res.model };
    },
  };
}

export function googleProvider(apiKey: string): LlmProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    provider: 'google',
    async complete(model, req) {
      let res;
      try {
        res = await ai.models.generateContent({
          model,
          contents: req.prompt,
          config: { systemInstruction: req.system, maxOutputTokens: req.maxTokens, responseMimeType: 'application/json', responseJsonSchema: req.schema },
        });
      } catch (err) {
        return failed('google', err);
      }
      const u = res.usageMetadata;
      return {
        text: res.text ?? '',
        usage: { inputTokens: u?.promptTokenCount ?? 0, outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) },
        model: res.modelVersion ?? model,
      };
    },
  };
}

export function createProvider(provider: Provider, apiKey: string): LlmProvider {
  switch (provider) {
    case 'anthropic':
      return anthropicProvider(apiKey);
    case 'openai':
      return openaiProvider(apiKey);
    case 'google':
      return googleProvider(apiKey);
  }
}
