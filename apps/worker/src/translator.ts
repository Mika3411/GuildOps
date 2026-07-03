import { createHash } from "node:crypto";
import { env } from "./env.js";

export type TranslationResult = {
  provider: string;
  providerRequestHash: string;
  text: string;
};

export async function translateText(input: {
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
}): Promise<TranslationResult> {
  const provider = env.TRANSLATION_PROVIDER;

  if (env.TRANSLATION_API_URL && env.TRANSLATION_API_KEY) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.TRANSLATION_API_TIMEOUT_MS);

    try {
      const response = await fetch(env.TRANSLATION_API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.TRANSLATION_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
          text: input.text
        })
      });

      if (!response.ok) {
        throw new Error(`Translation provider failed with ${response.status}`);
      }

      const payload = (await response.json()) as { translatedText?: string; text?: string };
      const translatedText = payload.translatedText ?? payload.text;

      if (!translatedText) {
        throw new Error("Translation provider returned no translated text");
      }

      return {
        provider,
        providerRequestHash: hashRequest(input),
        text: translatedText
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Translation provider timed out after ${env.TRANSLATION_API_TIMEOUT_MS}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    provider: "identity",
    providerRequestHash: hashRequest(input),
    text: input.text
  };
}

function hashRequest(input: { sourceLanguage: string; targetLanguage: string; text: string }): string {
  return createHash("sha256")
    .update(input.sourceLanguage)
    .update("\0")
    .update(input.targetLanguage)
    .update("\0")
    .update(input.text)
    .digest("hex");
}
