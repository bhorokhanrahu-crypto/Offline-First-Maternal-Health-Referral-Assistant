# Online model behavior

The online mode calls the Groq-hosted model configured by `GROQ_MODEL`
(default: `llama-3.3-70b-versatile`). The model is not downloaded into this folder.
Its safety and scope instructions live in `assistant_instructions.txt`.
The chat is restricted to pregnancy, maternal and child health, newborn care,
and basic first aid. The server checks the latest question and responds locally
to unrelated requests without forwarding them to Groq. The model instructions
reinforce the same boundary. The chat status endpoint reports whether a server
key is configured and which model ID is selected. Invalid keys, unavailable
models and account limits are reported with separate user-facing messages.

Offline mode never calls this model. Referral flags are always evaluated by the
deterministic local rules in `src/rules.js`, which remain unverified demo rules.
If care has been delayed, the assistant tells users to contact a clinician as
soon as possible; severe or worsening symptoms need emergency care now. AI
replies are informational only and are not validated clinical guidance.
