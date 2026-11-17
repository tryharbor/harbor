import { HarborError } from '@harbor/core';
import { PromptedModel } from './prompted.ts';
import { CATALOG, PROVIDERS, createProvider, defaultModelFor, type LlmProvider, type Provider } from './providers.ts';
import { SimulatedModel, type SimulatedModelOptions } from './simulated.ts';
import type { SiteCopyInput } from './site.ts';
import type { ContentModel, DigestInput, DraftInput, GenerateIdeasInput, LearnVoiceInput, RefineVoiceChangesInput, RewriteInput } from './types.ts';

export const MODEL_MODES = ['simulated', ...PROVIDERS] as const;
export type ModelMode = (typeof MODEL_MODES)[number];

export interface ModelConfig {
  provider: ModelMode;
  /** A model id; the provider's default when left out. */
  model?: string;
  /** Required for a real provider. */
  apiKey?: string;
}

/**
 * The model Harbor uses right now. Every feature talks to this; the workspace's settings (or HARBOR_MODEL at start-up)
 * decide which model answers, and changing them takes effect on the next call without a restart.
 */
export class ModelRouter implements ContentModel {
  private current: ContentModel;
  private config: ModelConfig = { provider: 'simulated' };

  constructor(
    private readonly sim: SimulatedModel = new SimulatedModel(),
    config: ModelConfig = { provider: 'simulated' },
    private readonly providerFor: (p: Provider, key: string) => LlmProvider = createProvider,
  ) {
    this.current = sim;
    this.configure(config);
  }

  configure(config: ModelConfig): void {
    if (config.provider === 'simulated') {
      this.current = this.sim;
      this.config = { provider: 'simulated' };
      return;
    }
    if (!config.apiKey) throw new HarborError('INVALID_REQUEST', `${CATALOG[config.provider].name} needs an API key.`);
    const model = config.model || defaultModelFor(config.provider);
    this.current = new PromptedModel(this.providerFor(config.provider, config.apiKey), model);
    this.config = { provider: config.provider, model };
  }

  /** Which provider and model answer now (never the key). */
  get active(): { provider: ModelMode; model: string } {
    return { provider: this.config.provider, model: this.current.name };
  }
  /** The active real provider and model, for features that talk to it directly (the app builder); none when simulated. */
  get llm(): { provider: LlmProvider; model: string } | undefined {
    return this.current instanceof PromptedModel ? { provider: this.current.llm, model: this.current.model } : undefined;
  }
  get name() {
    return this.current.name;
  }
  get simulated() {
    return this.current.simulated;
  }

  learnVoice(i: LearnVoiceInput) { return this.current.learnVoice(i); }
  generateIdeas(i: GenerateIdeasInput) { return this.current.generateIdeas(i); }
  draft(i: DraftInput) { return this.current.draft(i); }
  rewrite(i: RewriteInput) { return this.current.rewrite(i); }
  digest(i: DigestInput) { return this.current.digest(i); }
  refineVoiceChanges(i: RefineVoiceChangesInput) { return this.current.refineVoiceChanges(i); }
  siteCopy(i: SiteCopyInput) { return this.current.siteCopy(i); }
}

/** HARBOR_MODEL: unset or "simulated" (default), or a provider: "anthropic", "openai", "google". */
export function modelModeFromEnv(env: Record<string, string | undefined> = process.env): ModelMode {
  const v = (env.HARBOR_MODEL ?? '').trim().toLowerCase();
  if (!v) return 'simulated';
  if ((MODEL_MODES as readonly string[]).includes(v)) return v as ModelMode;
  throw new Error(`HARBOR_MODEL must be one of ${MODEL_MODES.join(', ')}; got "${env.HARBOR_MODEL}".`);
}

/** Harbor's own key for a provider, from the environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY …). */
export const envKeyFor = (p: Provider, env: Record<string, string | undefined> = process.env) =>
  CATALOG[p].envKeys.map((k) => env[k]?.trim()).find(Boolean);

/** The start-up model from the environment: HARBOR_MODEL picks the provider, HARBOR_MODEL_ID the model. */
export function createModel(env: Record<string, string | undefined> = process.env, opts: SimulatedModelOptions = {}): ModelRouter {
  const provider = modelModeFromEnv(env);
  const sim = new SimulatedModel(opts);
  if (provider === 'simulated') return new ModelRouter(sim);
  const apiKey = envKeyFor(provider, env);
  if (!apiKey) throw new Error(`HARBOR_MODEL=${provider} needs ${CATALOG[provider].envKeys.join(' or ')}.`);
  return new ModelRouter(sim, { provider, model: env.HARBOR_MODEL_ID?.trim() || undefined, apiKey });
}
