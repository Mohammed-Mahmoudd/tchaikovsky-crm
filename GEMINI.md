# GEMINI.md

Rules for AI agents in this folder (Gemini, Claude and any other model).

## Never touch real customer conversations (strict)

This project sends real messages to real leads, students and parents through Messenger, Instagram and WhatsApp. Delivered messages cannot be unsent or edited.

- Never send, edit, delete or react to a message, and never send read receipts, typing indicators or Meta thread-control calls, to any real lead, customer or student. This includes tests, diagnosis and cleanup.
- If a send seems necessary to diagnose or verify something, do not do it. Tell the user exactly what you wanted to do and why, then wait.
- Read-only work is allowed: reading code and logs, GET requests, `thread_owner` lookups, syntax checks, builds.
- A safety hook blocks risky commands. If a command is blocked, report it to the user. Do not work around it.
- Ask before any write or delete on the production server or database.
- Never print tokens, passwords or connection strings.

Read `AGENTS.md (and ../Agents.md, section 4)` for the full policy and the project rules before changing anything.
