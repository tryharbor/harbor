import { AnthropicModel } from './anthropic.ts';
import { SimulatedModel, type SimulatedModelOptions } from './simulated.ts';
import type { ContentModel } from './types.ts';

export * from './types.ts';
export { SimulatedModel, SIMULATED_MODEL_NAME, applyStyle, voiceStats, type SimulatedModelOptions, type VoiceStats } from './simulated.ts';
export { AnthropicModel, ANTHROPIC_OFF_MESSAGE } from './anthropic.ts';

export const MODEL_MODES = ['simulated', 'anthropic'] as const;
export type ModelMode = (typeof MODEL_MODES)[number];

/** HARBOR_MODEL: unset or "simulated" (default) → simulated; "anthropic" → the real model (stubbed for now). */
export function modelModeFromEnv(env: Record<string, string | undefined> = process.env): ModelMode {
  const v = (env.HARBOR_MODEL ?? '').trim().toLowerCase();
  if (!v || v === 'simulated') return 'simulated';
  if (v === 'anthropic') return 'anthropic';
  throw new Error(`HARBOR_MODEL must be "simulated" or "anthropic", got "${env.HARBOR_MODEL}".`);
}

export function createModel(env: Record<string, string | undefined> = process.env, opts: SimulatedModelOptions = {}): ContentModel {
  return modelModeFromEnv(env) === 'anthropic' ? new AnthropicModel() : new SimulatedModel(opts);
}
