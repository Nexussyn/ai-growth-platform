# TypeScript Function to Try Free LLMs

Here's a TypeScript async function that attempts to get a response from free LLM APIs (Gemini 1.5 Flash and HuggingFace Mistral-7B-Instruct) with proper timeout handling:

```typescript
/**
 * Tries free LLM APIs in sequence and returns the first successful response.
 * Attempts Gemini 1.5 Flash first, then HuggingFace Mistral-7B-Instruct.
 * Each request has a 20-second timeout using AbortSignal.
 * 
 * @param prompt - The input prompt to send to the LLM
 * @returns Promise<string> - The generated text or empty string if all fail
 */
async function tryFreeLLMs(prompt: string): Promise<string> {
  const TIMEOUT_MS = 20000; // 20 seconds

  // Environment variables for API keys
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const HF_API_KEY = process.env.HF_API_KEY;

  /**
   * Creates an AbortSignal that times out after specified milliseconds
   */
  const createTimeoutSignal = (ms: number): AbortSignal => {
    return AbortSignal.timeout(ms);
  };

  /**
   * Try Gemini 1.5 Flash API
   */
  const tryGemini = async (): Promise<string | null> => {
    if (!GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY not set, skipping Gemini");
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
        signal: createTimeoutSignal(TIMEOUT_MS),
      });

      if (!response.ok) {
        console.error(`Gemini API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      // Extract text from Gemini response structure
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (typeof text === "string" && text.trim().length > 0) {
        return text.trim();
      }
      
      return null;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          console.error("Gemini request timed out");
        } else {
          console.error(`Gemini error: ${error.message}`);
        }
      }
      return null;
    }
  };

  /**
   * Try HuggingFace Mistral-7B-Instruct API
   */
  const tryHuggingFaceMistral = async (): Promise<string | null> => {
    if (!HF_API_KEY) {
      console.warn("HF_API_KEY not set, skipping HuggingFace");
      return null;
    }

    const url = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";

    // Format prompt for Mistral instruction format
    const formattedPrompt = `<s>[INST] ${prompt} [/INST]`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_API_KEY}`,
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
        signal: createTimeoutSignal(TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`HuggingFace API error: ${response.status} ${response.statusText} - ${errorText}`);
        return null;
      }

      const data = await response.json();
      
      // HuggingFace returns an array of generated texts
      let text: string | undefined;
      
      if (Array.isArray(data) && data.length > 0) {
        text = data[0]?.generated_text;
      } else if (typeof data?.generated_text === "string") {
        text = data.generated_text;
      }
      
      if (typeof text === "string" && text.trim().length > 0) {
        return text.trim();
      }
      
      return null;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          console.error("HuggingFace request timed out");
        } else {
          console.error(`HuggingFace error: ${error.message}`);
        }
      }
      return null;
    }
  };

  // Try Gemini first
  console.log("Trying Gemini 1.5 Flash...");
  const geminiResult = await tryGemini();
  if (geminiResult) {
    console.log("Successfully got response from Gemini");
    return geminiResult;
  }

  // Try HuggingFace Mistral as fallback
  console.log("Trying HuggingFace Mistral-7B-Instruct...");
  const mistralResult = await tryHuggingFaceMistral();
  if (mistralResult) {
    console.log("Successfully got response from HuggingFace Mistral");
    return mistralResult;
  }

  // All attempts failed
  console.error("All LLM attempts failed");
  return "";
}

// Export the function
export { tryFreeLLMs };

// ============================================================
// Usage Example and Tests
// ============================================================

async function main() {
  // Example usage
  const prompt = "Explain quantum computing in one sentence.";
  
  console.log("=".repeat(50));
  console.log(`Prompt: "${prompt}"`);
  console.log("=".repeat(50));
  
  const result = await tryFreeLLMs(prompt);
  
  if (result) {
    console.log("\n✅ Response received:");
    console.log(result);
  } else {
    console.log("\n❌ No response received from any LLM");
  }
}

// Run if executed directly
main().catch(console.error);
```

## Environment Setup

Create a `.env` file or set environment variables:

```bash
# .env
GEMINI_API_KEY=your_gemini_api_key_here
HF_API_KEY=your_huggingface_api_key_here
```

## Alternative Version with Custom Timeout Polyfill

If you're using an older Node.js version that doesn't support `AbortSignal.timeout()`:

```typescript
/**
 * Polyfill for AbortSignal.timeout for older environments
 */
function createTimeoutSignal(ms: number): AbortSignal {
  // Use native if available (Node 18+)
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  
  // Polyfill for older environments
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("Signal timed out", "TimeoutError"));
  }, ms);
  
  // Clean up timeout if signal is aborted externally
  controller.signal.addEventListener("abort", () => {
    clearTimeout(timeoutId);
  }, { once: true });
  
  return controller.signal;
}
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Sequential Fallback** | Tries Gemini first, then HuggingFace if Gemini fails |
| **20s Timeout** | Uses `AbortSignal.timeout()` for clean timeout handling |
| **Error Handling** | Gracefully handles network errors, timeouts, and API errors |
| **Type Safety** | Full TypeScript types with proper null checking |
| **Empty String Fallback** | Returns `""` if all attempts fail (as specified) |

## Getting Free API Keys

1. **Gemini API Key**: [Google AI Studio](https://aistudio.google.com/app/apikey)
2. **HuggingFace API Key**: [HuggingFace Settings](https://huggingface.co/settings/tokens)