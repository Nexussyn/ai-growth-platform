# TypeScript Function to Try Free LLMs

Here's a TypeScript async function that attempts to get a response from free LLM APIs (Gemini 1.5 Flash and HuggingFace Mistral-7B-Instruct) with proper timeout handling:

```typescript
/**
 * Tries free LLM APIs in sequence with timeout handling.
 * Attempts Gemini 1.5 Flash first, then falls back to HuggingFace Mistral-7B-Instruct.
 * @param prompt - The text prompt to send to the LLMs
 * @returns Promise<string> - First successful response or empty string
 */
async function tryFreeLLMs(prompt: string): Promise<string> {
  const TIMEOUT_MS = 20_000; // 20 seconds

  // Helper to create AbortSignal with timeout
  const createTimeoutSignal = (): AbortSignal => {
    return AbortSignal.timeout(TIMEOUT_MS);
  };

  // --- Attempt 1: Google Gemini 1.5 Flash ---
  const tryGemini = async (): Promise<string | null> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY not set, skipping Gemini");
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
        signal: createTimeoutSignal(),
      });

      if (!response.ok) {
        console.warn(`Gemini API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      // Extract text from Gemini response structure
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (typeof text === "string" && text.trim()) {
        console.log("✓ Gemini 1.5 Flash responded successfully");
        return text.trim();
      }
      
      return null;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          console.warn("Gemini request timed out after 20s");
        } else {
          console.warn(`Gemini error: ${error.message}`);
        }
      }
      return null;
    }
  };

  // --- Attempt 2: HuggingFace Mistral-7B-Instruct ---
  const tryHuggingFaceMistral = async (): Promise<string | null> => {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      console.warn("HUGGINGFACE_API_KEY not set, skipping HuggingFace");
      return null;
    }

    const url = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";

    // Format prompt for Mistral instruction format
    const formattedPrompt = `<s>[INST] ${prompt} [/INST]`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: formattedPrompt,
          parameters: {
            max_new_tokens: 1024,
            temperature: 0.7,
            do_sample: true,
            return_full_text: false,
          },
        }),
        signal: createTimeoutSignal(),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.warn(`HuggingFace API error: ${response.status} ${response.statusText} - ${errorBody}`);
        return null;
      }

      const data = await response.json();

      // HuggingFace returns array of generated texts
      let text: string | undefined;
      
      if (Array.isArray(data) && data[0]?.generated_text) {
        text = data[0].generated_text;
      } else if (typeof data?.generated_text === "string") {
        text = data.generated_text;
      }

      if (typeof text === "string" && text.trim()) {
        console.log("✓ HuggingFace Mistral-7B-Instruct responded successfully");
        return text.trim();
      }

      return null;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          console.warn("HuggingFace request timed out after 20s");
        } else {
          console.warn(`HuggingFace error: ${error.message}`);
        }
      }
      return null;
    }
  };

  // --- Execute in sequence ---
  console.log(`Attempting free LLMs with prompt: "${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}"`);

  // Try Gemini first
  const geminiResult = await tryGemini();
  if (geminiResult) {
    return geminiResult;
  }

  // Fall back to HuggingFace Mistral
  const mistralResult = await tryHuggingFaceMistral();
  if (mistralResult) {
    return mistralResult;
  }

  // Both failed
  console.warn("All LLM attempts failed, returning empty string");
  return "";
}

export { tryFreeLLMs };

// --- Type definitions for API responses ---
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface HuggingFaceResponse {
  generated_text?: string;
}

// --- Example usage ---
async function main() {
  // Ensure you have these environment variables set:
  // - GEMINI_API_KEY (get from https://makersuite.google.com/app/apikey)
  // - HUGGINGFACE_API_KEY (get from https://huggingface.co/settings/tokens)

  const result = await tryFreeLLMs("Explain quantum computing in one paragraph.");
  
  if (result) {
    console.log("\n--- LLM Response ---");
    console.log(result);
  } else {
    console.log("No response received from any LLM");
  }
}

// Uncomment to run:
// main().catch(console.error);
```

## Key Features

| Feature | Implementation |
|---------|----------------|
| **Timeout Handling** | Uses `AbortSignal.timeout(20000)` for 20-second timeout per request |
| **Sequential Fallback** | Tries Gemini first, then HuggingFace if Gemini fails |
| **Error Handling** | Catches network errors, timeouts, and API errors gracefully |
| **Type Safety** | Full TypeScript types for API responses |
| **Prompt Formatting** | Formats prompt correctly for Mistral instruction format |

## Environment Variables Required

```bash
# .env file
GEMINI_API_KEY=your_gemini_api_key_here
HUGGINGFACE_API_KEY=your_huggingface_token_here
```

## API Free Tier Limits

| Provider | Model | Free Tier |
|----------|-------|-----------|
| Google Gemini | gemini-1.5-flash | 15 RPM, 1M tokens/day |
| HuggingFace | Mistral-7B-Instruct | Rate limited, free inference API |

## Alternative with Parallel Racing (Bonus)

If you want to try both simultaneously and return the first success:

```typescript
async function tryFreeLLMsParallel(prompt: string): Promise<string> {
  const TIMEOUT_MS = 20_000;

  const geminiPromise = tryGeminiInternal(prompt, TIMEOUT_MS);
  const mistralPromise = tryMistralInternal(prompt, TIMEOUT_MS);

  // Race for first successful result
  const results = await Promise.allSettled([geminiPromise, mistralPromise]);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      return result.value;
    }
  }

  return "";
}
```