
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonContent } from "../types";
import { translateTextFallback } from "./translationService";

// Khởi tạo AI Client
// Lưu ý: process.env.API_KEY được Vite điền giá trị vào lúc Build thông qua file vite.config.ts
const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("❌ CRITICAL ERROR: API Key is missing!");
  console.error("Please set VITE_API_KEY in your Vercel/Netlify Environment Variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "dummy_key_to_prevent_crash_on_init" });

// Use standard Flash model for better quality translation
const MODEL_NAME = "gemini-2.5-flash";

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
const MAX_REQUESTS_PER_MINUTE = 15; // Increased slightly for better experience
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
// MODIFIED: Accepts a translated text now
const getFallbackLesson = (text: string, translatedText?: string): LessonContent => ({
    cleanedSourceText: text,
    referenceTranslation: translatedText || "Hệ thống đang bận. Vui lòng tự dịch và kiểm tra sau.",
    keyTerms: [], // No AI means no key term extraction, return empty
    source: 'Fallback'
});

// HYBRID FALLBACK: EN Phonetics + VI Meaning
const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    let phonetic = "";
    let definitionEN = "";

    // 1. Try to get Phonetic and EN definition from Free Dictionary API
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
        if (response.ok) {
            const data = await response.json();
            const firstEntry = data[0];
            phonetic = firstEntry.phonetic || (firstEntry.phonetics.find((p:any) => p.text)?.text) || "";
            if (phonetic) phonetic = phonetic.replace(/\//g, '');
            
            // Get simple EN definition to help with translation context if needed
            definitionEN = firstEntry.meanings[0]?.definitions[0]?.definition || "";
        }
    } catch (e) {
        // Ignore dictionary error, proceed to translation
    }

    // 2. Get Vietnamese Meaning using Translation Service (Google Translate/MyMemory)
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
    shortMeaning: reason === 'rate_limit' ? "Đợi 1 chút..." : "Lỗi Key/Quota",
    phonetic: "...",
    detailedExplanation: reason === 'rate_limit' 
        ? "Bạn đang tra quá nhanh (trên 15 từ/phút). Vui lòng đợi khoảng 30 giây để hệ thống hồi phục." 
        : "Không kết nối được AI (Kiểm tra VITE_API_KEY trên Vercel) và không tìm thấy từ này trong từ điển dự phòng."
});

export const generateLessonForChunk = async (textChunk: string): Promise<LessonContent> => {
  // 1. Try AI First
  if (apiKey && apiKey !== "dummy_key_to_prevent_crash_on_init" && checkRateLimit()) {
      try {
          return await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: `
                You are an expert academic translator (English to Vietnamese).
                INPUT: "${textChunk}"
                TASKS:
                1. Clean PDF artifacts (remove headers, page nums, random names).
                2. Translate the cleaned text to natural, professional Vietnamese.
                3. Extract 3-5 difficult key terms/idioms with meanings.
                Return purely JSON.
                `,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: lessonSchema,
                    temperature: 0.1, 
                },
            });

            let jsonText = response.text;
            if (!jsonText) throw new Error("No data returned from Gemini");
            
            // Clean markdown code blocks if present
            jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

            const data = JSON.parse(jsonText) as LessonContent;
            data.source = 'AI'; // Mark as AI generated
            return data;
          }, 2, 2000); // 2 retries for AI
      } catch (error) {
          console.warn("Gemini API failed, switching to fallback translation...", error);
          // Fall through to fallback below
      }
  } else {
      console.warn("API Key missing or Rate Limit hit. Using Fallback immediately.");
  }

  // 2. Fallback: Use Free Translation API
  try {
      console.log("Fetching fallback translation...");
      const translated = await translateTextFallback(textChunk);
      return getFallbackLesson(textChunk, translated);
  } catch (err) {
      console.error("Fallback translation also failed", err);
      // 3. Ultimate Fallback: Just return text with error message
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
        try { return await fetchVietnameseFallback(phrase); } catch { return getFallbackDictionary(phrase, 'rate_limit'); }
    }

    if (!apiKey || apiKey === "dummy_key_to_prevent_crash_on_init") {
        try { return await fetchVietnameseFallback(phrase); } catch { return getFallbackDictionary(phrase, 'quota'); }
    }

    const prompt = `
      Context: "${fullContext}"
      Phrase to define: "${phrase}"
      
      Task:
      1. Provide a concise Vietnamese meaning (max 6 words) for the tooltip.
      2. Provide the IPA phonetic transcription.
      3. Provide a detailed explanation in Vietnamese (usage, nuances).
    `;

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            shortMeaning: { type: Type.STRING },
            phonetic: { type: Type.STRING },
            detailedExplanation: { type: Type.STRING }
        },
        required: ["shortMeaning", "phonetic", "detailedExplanation"]
    };

    try {
        const result = await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema }
            });
            let text = response.text || "";
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            
            if (text) return JSON.parse(text) as DictionaryResponse;
            throw new Error("Empty response");
        }, 1, 1000); 
        
        dictionaryCache.set(cacheKey, result);
        saveCacheToStorage();
        return result;

    } catch (error) {
        // Fallback to Hybrid (EN Phonetic + VI Translation)
        try {
            const fallbackResult = await fetchVietnameseFallback(phrase);
            return fallbackResult;
        } catch (e) {
             return getFallbackDictionary(phrase, 'quota');
        }
    }
}
