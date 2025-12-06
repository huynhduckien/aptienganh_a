
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonContent } from "../types";
import { translateTextFallback } from "./translationService";

// Khởi tạo AI Client
const apiKey = process.env.API_KEY;

// DEBUG LOGGING
if (!apiKey || apiKey.length < 10) {
    console.warn("⚠️ API Key đang bị RỖNG hoặc KHÔNG HỢP LỆ.");
} 

const ai = new GoogleGenAI({ apiKey: apiKey || "dummy_key_to_prevent_crash_on_init" });

// Use standard Flash model for better quality translation
const MODEL_NAME = "gemini-2.0-flash-lite-preview-02-05";

// --- PERSISTENT CACHE ---
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
const MAX_REQUESTS_PER_MINUTE = 12;
const requestTimestamps: number[] = [];

const checkRateLimit = (): boolean => {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - 60000) {
    requestTimestamps.shift();
  }
  
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return false; 
  }

  requestTimestamps.push(now);
  return true;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 2, initialDelay = 1000): Promise<T> {
  let currentDelay = initialDelay;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isQuotaError = 
        error.message?.includes('429') || 
        error.message?.includes('quota') || 
        error.message?.includes('resource_exhausted') ||
        error.status === 429;

      if (isQuotaError) {
         console.warn("Gemini Quota Exceeded. Switching to fallback immediately.");
         throw new Error("QUOTA_EXCEEDED");
      }
      
      if (i < retries - 1) {
          await delay(currentDelay);
          currentDelay *= 2; 
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
    cleanedSourceText: { type: Type.STRING },
    referenceTranslation: { type: Type.STRING },
    keyTerms: {
      type: Type.ARRAY,
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

const getFallbackLesson = (text: string, translatedText?: string): LessonContent => ({
    cleanedSourceText: text,
    referenceTranslation: translatedText || "Hệ thống đang bận. Vui lòng tự dịch và kiểm tra sau.",
    keyTerms: [], 
    source: 'Fallback'
});

// IMPROVED FALLBACK: Better Phonetic Extraction
const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    let phonetic = "";
    let definitionEN = "";

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
        if (response.ok) {
            const data = await response.json();
            const firstEntry = data[0];
            
            // Logic lấy phiên âm thông minh hơn
            if (firstEntry.phonetics && Array.isArray(firstEntry.phonetics)) {
                // Ưu tiên cái nào có text và audio, hoặc ít nhất là text
                const validPhonetic = firstEntry.phonetics.find((p: any) => p.text && p.text.trim() !== "");
                if (validPhonetic) {
                    phonetic = validPhonetic.text;
                } else if (firstEntry.phonetic) {
                    phonetic = firstEntry.phonetic;
                }
            }
            
            // Làm sạch dấu ngoặc nếu có (để hiển thị thống nhất)
            phonetic = phonetic.replace(/^[/\[]/, '').replace(/[/\]]$/, '');

            definitionEN = firstEntry.meanings[0]?.definitions[0]?.definition || "";
        }
    } catch (e) { 
        console.warn("Dictionary API failed", e);
    }

    let vietnameseMeaning = "";
    try {
        vietnameseMeaning = await translateTextFallback(term);
    } catch (e) {
        vietnameseMeaning = "Lỗi dịch";
    }

    return {
        shortMeaning: vietnameseMeaning,
        phonetic: phonetic, // Trả về dạng text thô (ví dụ: "həˈləʊ"), UI sẽ tự thêm dấu /.../
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
      }
  }

  try {
      const translated = await translateTextFallback(textChunk);
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
         try { return await fetchVietnameseFallback(phrase); } catch { return getFallbackDictionary(phrase, 'rate_limit'); }
    }

    if (!apiKey || apiKey.length < 10) {
        try { return await fetchVietnameseFallback(phrase); } catch { return getFallbackDictionary(phrase, 'quota'); }
    }

    try {
        const result = await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: `Define "${phrase}" in Vietnamese (context: "${fullContext}"). JSON: shortMeaning, phonetic (IPA), detailedExplanation.`,
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
        try {
            return await fetchVietnameseFallback(phrase);
        } catch (e) {
             return getFallbackDictionary(phrase, 'quota');
        }
    }
}
