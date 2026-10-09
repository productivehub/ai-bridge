import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import type { DialectService } from "../types.js";
import type { OpenAIInput, AnthropicInput } from "./types.js";
import { openAIInputToBaseline, baselineToOpenAIOutput } from "./openai.js";
import { anthropicInputToBaseline, baselineToAnthropicOutput } from "./anthropic.js";

export { bridgeDialect } from "./bridge.js";
export { structuredDialect, baselineToStructuredOutput } from "./structured.js";

export const openaiDialect = {
  toBaseline: openAIInputToBaseline,
  fromBaseline: baselineToOpenAIOutput,
} satisfies DialectService<OpenAIInput, OpenAI.Chat.Completions.ChatCompletion>;

export const anthropicDialect = {
  toBaseline: anthropicInputToBaseline,
  fromBaseline: baselineToAnthropicOutput,
} satisfies DialectService<AnthropicInput, Anthropic.Messages.Message>;

export type * from "./types.js";
export { ollamaDialect } from "./ollama.js";
export type { OllamaOutput, OllamaMessage } from "./ollama.js";
export { jevDialect } from "./jev.js";
export type { JevJson, JevDescription, JevQuestion, JevInput, JevAnswer, JevOutput } from "./jev.js";
