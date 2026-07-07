import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function getEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function checkModeration(text: string): Promise<{ isSafe: boolean, reason?: string, category?: string }> {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          toxic: { type: SchemaType.BOOLEAN },
          containsNames: { type: SchemaType.BOOLEAN },
          isSpam: { type: SchemaType.BOOLEAN },
          reason: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING, description: "A broad 1-2 word category for this problem (e.g., Transportation, Software, Health, Finance). Return 'Unknown' if the text is too vague to categorize." }
        },
        required: ["toxic", "containsNames", "isSpam", "reason", "category"]
      }
    }
  });

  const prompt = `You are a strict content moderator for a public anonymous board.
Evaluate the following text and determine if it violates our policies:
1. No toxicity, hate speech, self-harm, or severe distress.
2. No real names of individuals (public figures are okay, but avoid personal attacks).
3. No advertisements, promotional links, or spam.

Text to evaluate: "${text}"`;

  try {
    const result = await model.generateContent(prompt);
    const response = JSON.parse(result.response.text());
    
    if (response.toxic || response.containsNames || response.isSpam) {
      return { isSafe: false, reason: response.reason };
    }
    
    return {
      isSafe: true,
      category: response.category
    };
  } catch (error) {
    console.error("Moderation failed:", error);
    return { isSafe: false, reason: "Moderation check failed. Please try again." };
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
