import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { TOOLS, SYSTEM_PROMPT } from '../_shared/tools.ts'
import {
  gibCreateInvoice,
  gibListInvoices,
  gibCancelInvoice,
  gibLookupRecipient,
} from '../_shared/gib.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function executeTool(
  toolName: string,
  input: Record<string, any>,
  username: string,
  password: string,
): Promise<unknown> {
  switch (toolName) {
    case 'lookup_recipient':
      return gibLookupRecipient(username, password, input.tax_id)

    case 'create_invoice':
      return gibCreateInvoice(username, password, {
        buyerName: input.buyer_name,
        buyerTaxId: input.buyer_tax_id,
        buyerAddress: input.buyer_address,
        items: input.items.map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unit_price,
          vatRate: i.vat_rate,
        })),
        date: input.date,
        currency: input.currency,
      })

    case 'list_invoices':
      return gibListInvoices(username, password, input.start_date, input.end_date)

    case 'cancel_invoice':
      return gibCancelInvoice(username, password, input.ettn, input.reason || 'İptal')

    default:
      throw new Error(`Bilinmeyen araç: ${toolName}`)
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { message, conversationId, username, password } = await req.json()

    if (!message || !username || !password) {
      return Response.json(
        { error: 'message, username ve password zorunludur.' },
        { headers: corsHeaders },
      )
    }

    // Ensure conversation exists
    let convId = conversationId
    if (!convId) {
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ gib_username: username, title: message.slice(0, 60) })
        .select('id')
        .single()
      if (error) throw error
      convId = conv.id
    }

    // Save user message
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message,
    })

    // Load conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20)

    const claudeMessages: Anthropic.MessageParam[] = (history ?? []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Agentic tool-use loop
    let assistantText = ''

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // @ts-ignore - cache_control for prompt caching
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: TOOLS.map((t, i) =>
          i === TOOLS.length - 1
            ? { ...t, cache_control: { type: 'ephemeral' } as any }
            : t,
        ),
        messages: claudeMessages,
      })

      // Collect text from this turn
      const textParts = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
      if (textParts.length) assistantText = textParts.join('')

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          b => b.type === 'tool_use',
        ) as Anthropic.ToolUseBlock[]

        // Push assistant turn (with tool use)
        claudeMessages.push({ role: 'assistant', content: response.content })

        // Execute all tools (in parallel when possible)
        const toolResults = await Promise.all(
          toolUseBlocks.map(async block => {
            let content: string
            try {
              const result = await executeTool(
                block.name,
                block.input as Record<string, any>,
                username,
                password,
              )
              content = JSON.stringify(result)
            } catch (err) {
              content = JSON.stringify({
                error: err instanceof Error ? err.message : 'İşlem başarısız.',
              })
            }
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content,
            }
          }),
        )

        claudeMessages.push({ role: 'user', content: toolResults })
        continue
      }

      break // max_tokens or unexpected stop
    }

    // Save assistant response
    if (assistantText) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: assistantText,
      })
    }

    return Response.json(
      { message: assistantText, conversationId: convId },
      { headers: corsHeaders },
    )
  } catch (err) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.'
    return Response.json({ error: message }, { headers: corsHeaders })
  }
})
