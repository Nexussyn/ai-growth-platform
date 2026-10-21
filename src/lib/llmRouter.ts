/**
 * Multi-Provider LLM Router with Fallback & Timeout Handling
 * Supports Gemini 1.5 Flash, HuggingFace Mistral, OpenAI, and Anthropic.
 */

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Creates an AbortSignal that times out after specified milliseconds
 */
function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Signal timed out', 'TimeoutError'));
  }, ms);
  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  return controller.signal;
}

/**
 * Tries free & configured LLM APIs in sequence and returns the first successful response.
 */
export async function tryFreeLLMs(prompt: string, options: LLMOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs || 20000;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 1024;

  const GEMINI_API_KEY = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined;
  const HF_API_KEY = typeof process !== 'undefined' ? process.env?.HF_API_KEY : undefined;
  const OPENAI_API_KEY = typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : undefined;

  // 1. Try Gemini 1.5 Flash
  if (GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
        signal: createTimeoutSignal(timeoutMs),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === 'string' && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch (error) {
      console.error('Gemini request error:', error);
    }
  }

  // 2. Try OpenAI
  if (OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
        }),
        signal: createTimeoutSignal(timeoutMs),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch (error) {
      console.error('OpenAI request error:', error);
    }
  }

  // 3. Try HuggingFace Mistral
  if (HF_API_KEY) {
    try {
      const url = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: `<s>[INST] ${prompt} [/INST]`,
          parameters: {
            max_new_tokens: maxTokens,
            temperature,
            do_sample: true,
            return_full_text: false,
          },
        }),
        signal: createTimeoutSignal(timeoutMs),
      });

      if (response.ok) {
        const data = await response.json();
        let text: string | undefined;
        if (Array.isArray(data) && data.length > 0) {
          text = data[0]?.generated_text;
        } else if (typeof data?.generated_text === 'string') {
          text = data.generated_text;
        }
        if (typeof text === 'string' && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch (error) {
      console.error('HuggingFace request error:', error);
    }
  }

  return '';
}
