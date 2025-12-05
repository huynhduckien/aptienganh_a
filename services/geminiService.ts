
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonContent } from "../types";
import { translateTextFallback } from "./translationService";

// Khởi tạo AI Client
// Lưu ý: process.env.API_KEY được Vite điền giá trị vào lúc Build thông qua file vite.config.ts
const apiKey = process.env.API_KEY;

// DEBUG LOGGING (Sẽ hiện trong F12 Console trình duyệt)
console.log("--- DEBUG API KEY STATUS ---");
if (!apiKey || apiKey.length < 10) {
    console.warn("⚠️ API Key đang bị RỖNG hoặc KHÔNG HỢP LỆ.");
    console.warn("Trên Vercel: Vào Settings -> Environment Variables -> Thêm VITE_API_KEY");
} else {
    console.log("✅ API Key đã được nạp thành công. Độ dài:", apiKey.length);
}

const ai = new GoogleGenAI({ apiKey: apiKey || "dummy_key_to_prevent_crash_on_init" });

// Use Flash Lite model (Newest Preview) for better speed and lower quota usage
const MODEL_NAME = "gemini-2.0-flash-lite-preview-02-05";

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
const MAX_REQUESTS_PER_MINUTE = 15; // Increased slightly for Flash Lite
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
         console.warn(`Gemini Quota Warning (Attempt ${i+1}/${retries}). Retrying in ${currentDelay}ms...`);
         if (i === retries - 1) throw new Error("QUOTA_EXCEEDED");
      }
      
      if (i < retries - 1) {
          await delay(currentDelay);
          currentDelay *= 1.5; // Backoff
          continue;
      }
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
        description: "The cleaned English source text."
    },
    referenceTranslation: {
      type: Type.STRING,
      description: "A natural, high-quality Vietnamese translation.",
    },
    keyTerms: {
      type: Type.ARRAY,
      description: "List of 3-5 difficult terms.",
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          meaning: { type: Type.STRING }
        },
        required: ["term", "meaning"]
      }
    }
  },
  required: ["cleanedSourceText", "referenceTranslation", "keyTerms"],
};

// Fallback Data Generators
const getFallbackLesson = (text: string, translatedText?: string): LessonContent => ({
    cleanedSourceText: text,
    referenceTranslation: translatedText || "Hệ thống đang bận. Vui lòng tự dịch và kiểm tra sau.",
    keyTerms: [], 
    source: 'Fallback'
});

// HYBRID FALLBACK: EN Phonetics + VI Meaning
const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    let phonetic = "";
    let definitionEN = "";

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
        if (response.ok) {
            const data = await response.json();
            const firstEntry = data[0];
            phonetic = firstEntry.phonetic || (firstEntry.phonetics.find((p:any) => p.text)?.text) || "";
            if (phonetic) phonetic = phonetic.replace(/\//g, '');
            definitionEN = firstEntry.meanings[0]?.definitions[0]?.definition || "";
        }
    } catch (e) { }

    let vietnameseMeaning = "";
    try {
        vietnameseMeaning = await translateTextFallback(term);
    } catch (e) {
        vietnameseMeaning = "Lỗi dịch";
    }

    return {
        shortMeaning: vietnameseMeaning,
        phonetic: phonetic,
        detailedExplanation: `[Chế độ Dịch máy]\n\nNghĩa tiếng Việt: ${vietnameseMeaning}\n\n${definitionEN ? `Định nghĩa gốc (EN): ${definitionEN}` : ""}`
    };
};

const getFallbackDictionary = (term: string, reason: 'quota' | 'rate_limit' = 'quota'): DictionaryResponse => ({
    shortMeaning: reason === 'rate_limit' ? "Đợi 1 chút..." : "Lỗi Quota",
    phonetic: "...",
    detailedExplanation: reason === 'rate_limit' 
        ? "Bạn đang tra quá nhanh. Vui lòng đợi 30 giây." 
        : "AI đang bị quá tải (Hết lượt miễn phí). Vui lòng thử lại sau 1 phút hoặc nhập API Key mới."
});

export const generateLessonForChunk = async (textChunk: string): Promise<LessonContent> => {
  // 1. Try AI First
  const isValidKey = apiKey && apiKey.length > 10 && apiKey !== "dummy_key_to_prevent_crash_on_init";
  
  if (isValidKey && checkRateLimit()) {
      try {
          return await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: `
                Translate to Vietnamese (Academic style).
                INPUT: "${textChunk}"
                TASKS:
                1. Clean PDF artifacts.
                2. Translate to Vietnamese.
                3. Extract 3 difficult terms.
                Return JSON.
                `,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: lessonSchema,
                },
            });

            let jsonText = response.text;
            if (!jsonText) throw new Error("No data returned");
            jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

            const data = JSON.parse(jsonText) as LessonContent;
            data.source = 'AI';
            return data;
          });
      } catch (error: any) {
          console.warn("AI Failed (Quota or Error). Switching to Fallback.", error.message);
          // If error is specifically quota, we proceed to fallback immediately
      }
  }

  // 2. Fallback: Use Free Translation API
  try {
      const translated = await translateTextFallback(textChunk);
      // Mark as Fallback so UI shows "Google Translate Mode"
      return getFallbackLesson(textChunk, translated);
  } catch (err) {
      return getFallbackLesson(textChunk, "Không thể dịch đoạn này. Vui lòng thử lại sau.");
  }
};

export interface DictionaryResponse {
    shortMeaning: string;
    detailedExplanation: string;
    phonetic: string;
}

export const explainPhrase = async (phrase: string, fullContext: string): Promise<DictionaryResponse> => {
    const cacheKey = phrase.trim().toLowerCase();
    if (dictionaryCache.has(cacheKey)) return dictionaryCache.get(cacheKey)!;

    if (!checkRateLimit()) {
         // Rate limit hit -> Go to fallback immediately to save quota
         try { return await fetchVietnameseFallback(phrase); } catch { return getFallbackDictionary(phrase, 'rate_limit'); }
    }

    if (!apiKey || apiKey.length < 10) {
        try { return await fetchVietnameseFallback(phrase); } catch { return getFallbackDictionary(phrase, 'quota'); }
    }

    // Try AI
    try {
        const result = await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: `Define "${phrase}" in Vietnamese (context: "${fullContext}"). JSON: shortMeaning, phonetic, detailedExplanation.`,
                config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { shortMeaning: {type:Type.STRING}, phonetic: {type:Type.STRING}, detailedExplanation: {type:Type.STRING}}}}
            });
            let text = response.text || "";
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            if (text) return JSON.parse(text) as DictionaryResponse;
            throw new Error("Empty");
        }, 1, 1000); 
        
        dictionaryCache.set(cacheKey, result);
        saveCacheToStorage();
        return result;

    } catch (error) {
        // AI Failed -> Use Fallback
        try {
            return await fetchVietnameseFallback(phrase);
        } catch (e) {
             return getFallbackDictionary(phrase, 'quota');
        }
    }
}
