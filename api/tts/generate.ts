type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (payload: unknown) => void;
  send: (payload: unknown) => void;
};

type TTSRequestBody = {
  text?: string;
  voiceName?: string;
  outputFormat?: string;
};

const EDGE_TTS_ENDPOINT = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildSsml = (text: string, voiceName: string) => {
  const sanitized = escapeXml(text);
  return `<speak version='1.0' xml:lang='en-GB'><voice xml:lang='en-GB' name='${voiceName}'>${sanitized}</voice></speak>`;
};

const getEdgeHeaders = (voiceOutputFormat: string) => {
  const auth = process.env.EDGE_TTS_AUTHORIZATION;
  if (!auth) {
    throw new Error("Missing EDGE_TTS_AUTHORIZATION env variable.");
  }

  return {
    "Content-Type": "application/ssml+xml",
    "X-Microsoft-OutputFormat": voiceOutputFormat,
    Authorization: auth,
    "User-Agent":
      process.env.EDGE_TTS_USER_AGENT ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
    Origin: process.env.EDGE_TTS_ORIGIN ?? "https://edge.microsoft.com",
    Referer: process.env.EDGE_TTS_REFERER ?? "https://edge.microsoft.com/",
    ...(process.env.EDGE_TTS_TRUSTED_CLIENT_TOKEN
      ? { "X-Edge-TTS-TrustedClientToken": process.env.EDGE_TTS_TRUSTED_CLIENT_TOKEN }
      : {}),
    ...(process.env.EDGE_TTS_COOKIE ? { Cookie: process.env.EDGE_TTS_COOKIE } : {}),
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = (req.body ?? {}) as TTSRequestBody;
  const text = (body.text ?? "").trim();
  const voiceName = (body.voiceName ?? "en-GB-RyanNeural").trim();
  const outputFormat = (body.outputFormat ?? "audio-24khz-48kbitrate-mono-mp3").trim();

  if (!text) {
    res.status(400).json({ error: "Missing text." });
    return;
  }

  try {
    const upstream = await fetch(EDGE_TTS_ENDPOINT, {
      method: "POST",
      headers: getEdgeHeaders(outputFormat),
      body: buildSsml(text, voiceName),
    });

    if (!upstream.ok) {
      const details = await upstream.text();
      res.status(upstream.status).json({ error: details || "Edge TTS synthesis failed." });
      return;
    }

    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audioBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Edge TTS error.";
    res.status(500).json({ error: message });
  }
}
