import { HarborError } from '@harbor/core';
import type { ContentModel } from './types.ts';

export const ANTHROPIC_OFF_MESSAGE =
  'Real model is off during the build-out. Set HARBOR_MODEL=anthropic and ANTHROPIC_API_KEY to enable.';

/**
 * Placeholder for the real model. Deliberately makes no calls and has no SDK dependency: during the build-out the
 * owner wants zero model spend. Every method throws NOT_IMPLEMENTED.
 */
export class AnthropicModel implements ContentModel {
  readonly name = 'anthropic';
  readonly simulated = false;
  private off(): never {
    throw new HarborError('NOT_IMPLEMENTED', ANTHROPIC_OFF_MESSAGE);
  }
  async learnVoice(): Promise<never> {
    this.off();
  }
  async generateIdeas(): Promise<never> {
    this.off();
  }
  async draft(): Promise<never> {
    this.off();
  }
  async rewrite(): Promise<never> {
    this.off();
  }
  async digest(): Promise<never> {
    this.off();
  }
}
