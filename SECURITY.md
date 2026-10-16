# Security

Please report security issues privately to **hello@useharbor.io** with "Security" in the subject, not in a public issue. Include the steps to reproduce and the impact you see. We'll confirm receipt and keep you posted while we fix it.

Things that matter most in Harbor:

- connected-account tokens (encrypted with `HARBOR_SECRET_KEY`)
- anything that could publish without a person's approval
- the public surface: OAuth callbacks, `/media`, `/mcp` and its API keys
