---
name: inloop-organization-brain
description: Use when the user mentions Digital Brain, Organization Brain, or Inloop Brain, wants to query it, or asks to submit a thread as organization learning. Inloop.Studio's Digital Brain is a mechanism to develop Organization's Institutional Memory inform of a pristine context layer for the Human+AI to work together.
---

# Inloop Organization Brain

Web tool and curation: https://app.inloop.studio/tools/organization-brain

## Connect (per organization)
- Ask for the brain slug in chat.
- Collect the API key only through a secret request (connector `inloop-brain`, field `api_key`). Never put the key in chat or a URL.

## Query
The Organization Brain is accessed via the OpenAI Compatible completions api.
- POST https://app.inloop.studio/api/v1/brains/<slug>/chat/completions
- Header: Authorization: Bearer <api_key>
- Model is always `inloop-organization-brain` (not `inloop-mind`, not the slug).

## Submit learnings (only when the user asks)
- Trigger phrases: "submit this to the brain", "organization learning", "feed this to Org Brain", "teach the brain this", "save this as institutional memory". Never auto-submit.
- POST https://app.inloop.studio/api/v1/brains/<slug>/learn with the same Bearer key.
- Payload: submission_id `learn-<64 hex>`, submitted_at (UTC), submitted_by name (email optional), and conversation id, title, bot_name and messages from this chat.
- Success is 202 with `accepted: true` and a `submission_id`.
- Curating and approving happen at the web tool.
