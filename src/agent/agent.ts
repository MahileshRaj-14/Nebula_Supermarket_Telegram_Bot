import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { createAgentTools } from './tools.js';

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY || 'mock-key',
});

const SYSTEM_PROMPT = `You are a highly capable AI Supermarket & Kirana Store Operations Manager operating directly through Telegram.

CORE RULES:
1. NEVER invent or hallucinate product prices, stock quantities, GST rates, HSN codes, or customer balances. ALL business data must strictly come from tool outputs.
2. Maintain active multi-turn billing state using draft bill tools ('add_item_to_bill', 'remove_item_from_bill', 'finalize_bill').
3. Oversell protection is enforced by the database tools. If a tool returns an error (e.g. insufficient stock), politely explain the error to the shopkeeper without modifying numbers manually.
4. Deterministic GST calculation is handled by the server. Always present GST breakdowns clearly when discussing bills.
5. If the user asks for an invoice PDF or PowerPoint analysis deck, use the appropriate generation tool and notify the user.
6. When the user asks you to remember a setting (e.g. payment preference, shop name), save it using 'set_preference'. When asked, fetch it via 'get_preference'.
7. Keep responses concise, clear, and professional. Use Indian Rupee symbol (₹).`;

export interface AgentResult {
  text: string;
  filesToSend: { filePath: string; fileType: 'pdf' | 'pptx' }[];
}

export async function processAgentMessage(
  telegramUserId: string,
  userMessage: string
): Promise<AgentResult> {
  const tools = createAgentTools(telegramUserId);
  const filesToSend: { filePath: string; fileType: 'pdf' | 'pptx' }[] = [];

  // Intercept tool results to collect files to send via Telegram
  const wrappedTools: any = {};
  for (const [toolName, toolObj] of Object.entries(tools)) {
    const originalExecute = (toolObj as any).execute;
    wrappedTools[toolName] = {
      ...toolObj,
      execute: async (args: any, context: any) => {
        const result = await originalExecute(args, context);
        if (result && result.success && result.filePath && result.fileType) {
          filesToSend.push({ filePath: result.filePath, fileType: result.fileType });
        }
        return result;
      },
    };
  }

  const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  try {
    const result = await generateText({
      model: groq(modelName) as any,
      system: SYSTEM_PROMPT,
      prompt: userMessage,
      tools: wrappedTools,
      maxSteps: 10, // Observe -> Reason -> Act loop up to 10 steps
    });

    return {
      text: result.text,
      filesToSend,
    };
  } catch (err: any) {
    console.error('[Agent Groq API Error]', err);
    if (err.message?.includes('invalid_api_key') || err.status === 401) {
      return {
        text: `⚠️ *Groq API Key Error:* Invalid or unauthorized GROQ_API_KEY.`,
        filesToSend: [],
      };
    }
    throw err;
  }
}
