# Add a Chat Action

I want to add a new action to the chat system: $ARGUMENTS

Existing action types (see `types/chat-actions.ts`):
`open_invoices` | `open_invoice_detail` | `open_invoice_preview` | `open_excel_export`

Steps:
1. `supabase/functions/_shared/tools.ts` — add/extend the Claude tool definition
2. `supabase/functions/chat/agent-loop.ts` (entry: `chat/index.ts`) — wire the tool result into an action; persistence in `chat/persist-action.ts`
3. `types/chat-actions.ts` (RN) **and** `supabase/functions/_shared/chat-types.ts` (Deno) — the payload contract is duplicated; extend both in tandem
4. `components/chat/chat-action-response.ts` + `components/chat/use-chat-screen.ts` — parse the action and handle it in the UI (buttons/modals live under `components/chat/`)
5. Test: `npm run test:chat`, then end-to-end with `npm run supabase:functions` + the app
