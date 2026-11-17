/**
 * Tests never reach a real AI provider: whatever keys the machine has (shell or .env), they're removed before any test
 * runs, so a model built from the environment can't call out and spend money. Tests that need a provider inject a fake.
 */
for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'HARBOR_MODEL', 'HARBOR_MODEL_ID']) {
  delete process.env[k];
}
