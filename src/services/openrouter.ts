import { Bindings } from '../types/env';

export async function generateAIPlan(env: Bindings, requestJson: string) {
  const primaryModel = env.AI_MODEL_PRIMARY;
  const fallbackModel = env.AI_MODEL_FALLBACK;

  const makeRequest = async (model: string) => {
    const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an AI that creates occupational therapy activity plans. Return strictly valid JSON in the format: { "title": "...", "summary": "...", "activities": [{ "title": "...", "instructions": "...", "frequency": "Daily", "durationMinutes": 10, "sortOrder": 0 }] }'
          },
          {
            role: 'user',
            content: requestJson
          }
        ],
        response_format: { type: "json_object" }
      })
    });
    
    if (!res.ok) {
      throw new Error(`OpenRouter API Error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  };

  try {
    return { model: primaryModel, data: await makeRequest(primaryModel) };
  } catch (error) {
    console.error(`Primary model ${primaryModel} failed:`, error);
    try {
      return { model: fallbackModel, data: await makeRequest(fallbackModel) };
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}
