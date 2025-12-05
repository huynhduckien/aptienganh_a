import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonContent } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Switch to Flash Lite as requested to mitigate quota issues
const MODEL_NAME = "gemini-flash-lite-latest";

// --- PERSISTENT CACHE ---
// Load cache from LocalStorage on init
const CACHE_KEY = 'paperlingo_dictionary_cache_v1';
const loadCache = (): Map<string, DictionaryResponse> => {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            return new Map(JSON.parse(stored));
        }
    } catch (e) {
        console.warn("Failed to load dictionary cache", e);
    }
    return new Map();
};

const dictionaryCache = loadCache();

const saveCacheToStorage = () => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(dictionaryCache.entries())));
    } catch (e) {
        console.warn("Failed to save dictionary cache", e);
    }
};

// --- RATE LIMITER CONFIGURATION ---
const MAX_REQUESTS_PER_MINUTE = 12; // Safety buffer (Google limit is usually 15 RPM)
const requestTimestamps: number[] = [];

// Helper: Check and update rate limit
const checkRateLimit = (): boolean => {
  const now = Date.now();
  // Filter out timestamps older than 1 minute
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - 60000) {
    requestTimestamps.shift();
  }
  
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return false; // Rate limit exceeded
  }

  requestTimestamps.push(now);
  return true;
};

// Helper: Wait for a specified duration
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry wrapper with Exponential Backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 2000): Promise<T> {
  let currentDelay = initialDelay;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check for 429 (Too Many Requests) or Quota related errors
      const isQuotaError = 
        error.message?.includes('429') || 
        error.message?.includes('quota') || 
        error.message?.includes('resource_exhausted') ||
        error.status === 429;

      if (isQuotaError) {
        if (i < retries - 1) {
             console.warn(`Quota limit hit. Retrying in ${currentDelay}ms... (Attempt ${i + 1}/${retries})`);
             await delay(currentDelay);
             currentDelay *= 2; // Exponential backoff (2s -> 4s -> 8s)
             continue;
        }
      }
      
      // If not a quota error or retries exhausted, throw
      throw error;
    }
  }
  throw new Error("Maximum retries exceeded");
}

const lessonSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    cleanedSourceText: {
        type: Type.STRING,
        description: "The cleaned English source text. Remove all PDF artifacts like 'ScienceDirect', 'Vol 55', 'Contents lists', page numbers, or random author names that are not part of the main sentence."
    },
    referenceTranslation: {
      type: Type.STRING,
      description: "A natural, high-quality Vietnamese translation of the cleaned English text.",
    },
    keyTerms: {
      type: Type.ARRAY,
      description: "List of 3-5 difficult terms or phrases found in the text with their meanings.",
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING, description: "The English term/phrase." },
          meaning: { type: Type.STRING, description: "Vietnamese meaning and brief explanation." }
        },
        required: ["term", "meaning"]
      }
    }
  },
  required: ["cleanedSourceText", "referenceTranslation", "keyTerms"],
};

// Fallback Data Generators
const getFallbackLesson = (text: string): LessonContent => ({
    cleanedSourceText: text,
    referenceTranslation: "[LỖI KẾT NỐI] Không thể kết nối tới AI. Vui lòng kiểm tra API Key trong cài đặt hoặc thử lại sau.",
    keyTerms: [
        { term: "API Key", meaning: "Khóa kết nối bị thiếu hoặc không hợp lệ." },
        { term: "Quota", meaning: "Có thể tài khoản đã hết hạn ngạch miễn phí." }
    ]
});

// Fallback to Free Dictionary API
const fetchFreeDictionary = async (term: string): Promise<DictionaryResponse> => {
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
        if (!response.ok) throw new Error("Not found");
        const data = await response.json();
        
        const firstEntry = data[0];
        const firstMeaning = firstEntry.meanings[0];
        const definition = firstMeaning.definitions[0].definition;
        const phonetic = firstEntry.phonetic || (firstEntry.phonetics.find((p:any) => p.text)?.text) || "";

        return {
            shortMeaning: "(EN) " + firstMeaning.partOfSpeech,
            phonetic: phonetic.replace(/\//g, ''),
            detailedExplanation: `[AI bận, dùng từ điển Anh-Anh miễn phí] \nDefinition: ${definition}\n\nExample: ${firstMeaning.definitions[0].example || "N/A"}`
        };
    } catch (e) {
        throw new Error("Free Dictionary failed");
    }
};

const getFallbackDictionary = (term: string, reason: 'quota' | 'rate_limit' = 'quota'): DictionaryResponse => ({
    shortMeaning: reason === 'rate_limit' ? "Đợi 1 chút..." : "Lỗi Quota",
    phonetic: "...",
    detailedExplanation: reason === 'rate_limit' 
        ? "Bạn đang tra quá nhanh (trên 12 từ/phút). Vui lòng đợi khoảng 30 giây để hệ thống hồi phục." 
        : "Hệ thống AI đang bận (Quá tải) và không tìm thấy từ này trong từ điển miễn phí dự phòng."
});

export const generateLessonForChunk = async (textChunk: string): Promise<LessonContent> => {
  // Generate Lesson is heavy, we always check rate limit but we prioritize it over dictionary
  if (!checkRateLimit()) {
      // If rate limited, we force a wait here instead of failing immediately for main content
      console.warn("Rate limit locally hit for Lesson, waiting 5s...");
      await delay(5000);
  }

  const prompt = `
    You are an expert academic translator.
    
    INPUT TEXT (Extracted from PDF, may contain artifacts):
    "${textChunk}"
    
    TASKS:
    1. **CLEAN**: Fix the input text. Remove any PDF headers/footers (e.g., 'ScienceDirect', dates, author lists, 'Corresponding author') that interrupt the flow. Join broken words.
    2. **TRANSLATE**: Translate the *cleaned* text into professional Vietnamese.
    3. **EXTRACT**: Identify key terms.

    Return the result in JSON.
  `;

  try {
      return await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
            responseMimeType: "application/json",
            responseSchema: lessonSchema,
            temperature: 0.1, 
            },
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("No data returned from Gemini");

        return JSON.parse(jsonText) as LessonContent;
      }, 3, 2000); // 3 retries, start waiting 2s
  } catch (error) {
      console.error("Gemini API Error (Lesson):", error);
      return getFallbackLesson(textChunk);
  }
};

export interface DictionaryResponse {
    shortMeaning: string;
    detailedExplanation: string;
    phonetic: string;
}

export const explainPhrase = async (phrase: string, fullContext: string): Promise<DictionaryResponse> => {
    // 1. Check Cache first (Does not consume Quota)
    const cacheKey = phrase.trim().toLowerCase();
    if (dictionaryCache.has(cacheKey)) {
        console.log("Cache hit for:", phrase);
        return dictionaryCache.get(cacheKey)!;
    }

    // 2. Client-side Rate Limiter Check
    if (!checkRateLimit()) {
        console.warn("Client-side rate limit hit.");
        // Try fallback dict if rate limited
        try {
            return await fetchFreeDictionary(phrase);
        } catch {
            return getFallbackDictionary(phrase, 'rate_limit');
        }
    }

    const prompt = `
      Context: "${fullContext}"
      Phrase to define: "${phrase}"
      
      Task:
      1. Provide a concise Vietnamese meaning (max 6 words) for the tooltip.
      2. Provide the IPA phonetic transcription (e.g., /həˈləʊ/).
      3. Provide a detailed explanation of how this phrase is used in this specific academic context (in Vietnamese).
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            shortMeaning: { type: Type.STRING, description: "Concise Vietnamese translation (max 6 words)." },
            phonetic: { type: Type.STRING, description: "IPA phonetic transcription." },
            detailedExplanation: { type: Type.STRING, description: "Detailed explanation of the term in this context." }
        },
        required: ["shortMeaning", "phonetic", "detailedExplanation"]
    };

    try {
        const result = await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });
            
            if (response.text) {
                return JSON.parse(response.text) as DictionaryResponse;
            }
            throw new Error("Empty response");
        }, 2, 1000); 
        
        // 3. Save to Cache
        dictionaryCache.set(cacheKey, result);
        saveCacheToStorage();
        
        return result;

    } catch (error) {
        console.error("Gemini API Error (Dictionary):", error);
        
        // 4. Fallback to Free Dictionary API if Gemini Quota dead
        try {
            const freeResult = await fetchFreeDictionary(phrase);
            // We don't cache free result to localstorage to allow retrying AI later
            // dictionaryCache.set(cacheKey, freeResult); 
            return freeResult;
        } catch (e) {
             return getFallbackDictionary(phrase, 'quota');
        }
    }
}