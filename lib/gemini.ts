interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

export async function generateComments(
  apiKey: string,
  tweetText: string
): Promise<string[]> {
  const prompt = `You are a social media expert. Generate 3 different engaging reply comments for the following tweet. Each comment should be:
- Natural and conversational
- Between 20-150 characters
- Appropriate for Twitter/X
- Varied in tone (one supportive, one thoughtful/questioning, one witty/humorous)

Tweet: "${tweetText}"

Return ONLY a JSON array with exactly 3 strings, no other text. Example format:
["Comment 1", "Comment 2", "Comment 3"]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
          temperature: 0.8,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data: GeminiResponse = await response.json();

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response from Gemini');
  }

  const text = data.candidates[0].content.parts[0].text;

  // Parse the JSON array from the response
  try {
    // Find JSON array in the response
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const comments = JSON.parse(match[0]);
      if (Array.isArray(comments) && comments.length >= 3) {
        return comments.slice(0, 3);
      }
    }
    throw new Error('Invalid response format');
  } catch {
    // Fallback: split by newlines if JSON parsing fails
    const lines = text
      .split('\n')
      .filter((line) => line.trim().length > 10)
      .slice(0, 3);

    if (lines.length >= 3) {
      return lines.map((line) => line.replace(/^[\d\.\-\*]+\s*/, '').trim());
    }

    throw new Error('Could not parse comments from response');
  }
}
