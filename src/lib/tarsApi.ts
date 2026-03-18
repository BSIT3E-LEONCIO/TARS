type ChatMessage = {
  sender: "user" | "tars";
  text: string;
};

type TarsSettings = {
  humor: number;
  honesty: number;
  sarcasm: number;
  sympathy: number;
  compassion: number;
  persona: "commander" | "engineer" | "companion" | "operator" | "observer";
  gender?: "male" | "female";
  speechLang?: string;
};

type ApiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const MAX_HISTORY_MESSAGES = 18;
const MAX_MESSAGE_CHARS = 900;

function buildSystemPrompt(settings: TarsSettings): string {
  const responseLangInstruction =
    settings.speechLang && settings.speechLang !== "auto"
      ? `- Default response language is ${settings.speechLang} unless the user asks for another language.`
      : "- Match the user's language automatically and keep the same language as the user's latest message.";

  return [
    "You are TARS from Interstellar in a web cockpit interface.",
    `Active persona is ${settings.persona}.`,
    ...(settings.gender ? [`Preferred voice style is ${settings.gender}.`] : []),
    `Humor level is ${settings.humor}%.`,
    `Honesty level is ${settings.honesty}%.`,
    `Sarcasm level is ${settings.sarcasm}%.`,
    `Sympathy level is ${settings.sympathy}%.`,
    `Compassion level is ${settings.compassion}%.`,
    "Behavior rules:",
    "- Stay concise and practical.",
    "- Use dry humor when humor level is above 50.",
    "- Keep direct and truthful answers aligned to the honesty level.",
    "- Sarcasm controls how much biting wit appears in short remarks.",
    "- Sympathy and compassion control how warm and reassuring your support sounds.",
    "- If persona is commander, be strategic and authoritative.",
    "- If persona is engineer, prefer technical precision and stepwise logic.",
    "- If persona is companion, be approachable and empathetic.",
    "- If persona is operator, keep responses brief and execution-focused.",
    "- If persona is observer, keep a neutral and factual style.",
    "- Avoid role-break; always speak as TARS.",
    "- Give actionable answers when user asks for help.",
    responseLangInstruction,
  ].join("\n");
}

function mapToApiMessages(conversation: ChatMessage[], settings: TarsSettings): ApiChatMessage[] {
  const mapped: ApiChatMessage[] = [
    { role: "system", content: buildSystemPrompt(settings) },
  ];

  const recentConversation = conversation.slice(-MAX_HISTORY_MESSAGES);

  for (const entry of recentConversation) {
    mapped.push({
      role: entry.sender === "user" ? "user" : "assistant",
      content: entry.text.slice(0, MAX_MESSAGE_CHARS),
    });
  }

  return mapped;
}

export async function getTarsReply(
  conversation: ChatMessage[],
  settings: TarsSettings,
  externalSignal?: AbortSignal,
): Promise<string> {
  const apiKey =
    (import.meta.env.VITE_LLM_API_KEY as string | undefined) ??
    (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ??
    (import.meta.env.VITE_GROQ_API_KEY as string | undefined) ??
    (import.meta.env.VITE_OPENAI_API_KEY as string | undefined);
  const baseUrl = (import.meta.env.VITE_LLM_API_BASE_URL as string | undefined) ?? DEFAULT_BASE_URL;
  const model = (import.meta.env.VITE_LLM_MODEL as string | undefined) ?? DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("Missing API key. Set VITE_LLM_API_KEY (preferred) or VITE_OPENROUTER_API_KEY / VITE_GROQ_API_KEY / VITE_OPENAI_API_KEY.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "TARS Web",
      },
      body: JSON.stringify({
        model,
        messages: mapToApiMessages(conversation, settings),
        temperature: settings.humor > 50 ? 0.9 : 0.45,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Model request failed.");
    }

    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Model returned an empty response.");
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}
