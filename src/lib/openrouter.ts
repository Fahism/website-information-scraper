import OpenAI from 'openai';

export const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  timeout: 60 * 1000, // 60s — prevents hanging forever if OpenRouter is slow
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    'X-Title': 'Business Intelligence Research Tool',
  },
});

export const OPENROUTER_MODEL = 'deepseek/deepseek-v3.2';

export function truncateToLimit(text: string, maxChars = 10000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...[truncated]';
}
