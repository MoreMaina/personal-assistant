# AI Copilot setup

This version uses the Gemini Developer API and Gemini 3.1 Flash-Lite.

In the project's root `.env.local`, configure:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
```

`GOOGLE_API_KEY` is also accepted by the server route. Never use a `NEXT_PUBLIC_`
prefix for the API key, paste the key into chat, or commit `.env.local`.

Restart the Next.js dev server after changing environment variables.

The endpoint verifies the signed-in Supabase user, selects that user's
`user_app_state` row, and sends a compact allowlisted context to Gemini. It
does not modify app data. The output is limited to 700 tokens.

A process-local limit of 20 requests per user per Nairobi day is implemented
for development. It resets when the server process restarts and is not a
reliable billing cap on multi-instance deployments. Check Google's current
quota and billing settings separately.

Important: Google's published Gemini API pricing page indicates that content
submitted on the free tier may be used to improve its products. Do not send
confidential data through the free tier. Paid-tier data handling differs;
check the current terms for your account.
