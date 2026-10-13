# Online model behavior

The online mode calls the Groq-hosted model configured by `GROQ_MODEL`
(default: `openai/gpt-oss-20b`). The model is not downloaded into this folder.
Its safety and scope instructions live in `assistant_instructions.txt`.

Offline mode never calls this model. Referral flags are always evaluated by the
deterministic local rules in `src/rules.js`, which remain unverified demo rules.
AI replies are informational only and are not validated clinical guidance.
