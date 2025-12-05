
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

// Sử dụng model Lite mới nhất để tiết kiệm Quota và tăng tốc độ
const MODEL_NAME = "gemini-2.0-flash-lite-preview-02-05";

// --- CIRCUIT BREAKER (CẦU DAO ĐIỆN) ---
// Nếu bị lỗi Quota, ngắt kết nối AI trong 60 giây để tránh bị khóa vĩnh viễn
let quotaCooldownUntil = 0;

const isSystemInCooldown = (): boolean => {
    return Date.now() < quotaCooldownUntil;
};

const triggerCooldown = () => {
    console.warn("🔥 QUOTA EXCEEDED: Kích hoạt chế độ làm mát trong 60s. Chuyển sang dịch dự phòng.");
    quotaCooldownUntil = Date.now() + 60000; // 60 seconds
};

// --- PERSISTENT CACHE ---
const CACHE_KEY = 'paperlingo_dictionary_cache_v2';
const loadCache = (): Map<string, DictionaryResponse> => {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            return new Map(JSON.parse(stored));
        }
    } catch (e) { }
    return new Map();
};

const dictionaryCache = loadCache();

const saveCacheToStorage = () => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(dictionaryCache.entries())));
    } catch (e) { }
};

// --- RATE LIMITER ---
// Giới hạn client-side để tránh gửi quá nhiều request cùng lúc
const MAX_REQUESTS_PER_MINUTE = 10; 
const requestTimestamps: number[] = [];

const checkRateLimit = (): boolean => {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - 60000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) return false;
  requestTimestamps.push(now);
  return true;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 1, initialDelay = 1000): Promise<T> {
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
         triggerCooldown(); // Trip the circuit breaker
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

// --- FALLBACK HANDLERS ---
const getFallbackLesson = (text: string, translatedText?: string): LessonContent => ({
    cleanedSourceText: text,
    referenceTranslation: translatedText || "Hệ thống đang bận. Đã chuyển sang chế độ dịch dự phòng.",
    keyTerms: [], 
    source: 'Fallback'
});

const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    let phonetic = "";
    let definitionEN = "";

    // 1. Get Phonetics from Free Dictionary API (English)
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

    // 2. Get Vietnamese Meaning via Translation Service
    let vietnameseMeaning = "";
    try {
        vietnameseMeaning = await translateTextFallback(term);
    } catch (e) {
        vietnameseMeaning = "Lỗi dịch";
    }

    return {
        shortMeaning: vietnameseMeaning,
        phonetic: phonetic,
        detailedExplanation: `[Chế độ Dự phòng]\n\nNghĩa: ${vietnameseMeaning}\n\n${definitionEN ? `Định nghĩa gốc: ${definitionEN}` : ""}`
    };
};

const getFallbackDictionary = (term: string, reason: string): DictionaryResponse => ({
    shortMeaning: "...",
    phonetic: "",
    detailedExplanation: reason
});

// --- MAIN FUNCTIONS ---

export const generateLessonForChunk = async (textChunk: string): Promise<LessonContent> => {
  const isValidKey = apiKey && apiKey.length > 10 && !apiKey.includes("dummy");
  
  // 1. CIRCUIT BREAKER CHECK
  if (isSystemInCooldown()) {
      console.log("Skipping AI due to cooldown. Using Fallback.");
      const translated = await translateTextFallback(textChunk);
      return getFallbackLesson(textChunk, translated);
  }

  // 2. RATE LIMIT CHECK
  if (!checkRateLimit()) {
      // Too fast? Use fallback temporarily
      const translated = await translateTextFallback(textChunk);
      return getFallbackLesson(textChunk, translated);
  }
  
  // 3. TRY AI
  if (isValidKey) {
      try {
          return await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: `
                Translate to Vietnamese (Academic Context).
                INPUT: "${textChunk}"
                TASKS:
                1. Clean PDF artifacts (remove citations like [1], (2022), urls).
                2. Translate naturally to Vietnamese.
                3. Pick 3 difficult terms.
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
          // Error already handled in withRetry (cooldown triggered)
          // Fall through to fallback
      }
  }

  // 4. FINAL FALLBACK
  try {
      const translated = await translateTextFallback(textChunk);
      return getFallbackLesson(textChunk, translated);
  } catch (err) {
      return getFallbackLesson(textChunk, "Lỗi kết nối. Vui lòng thử lại.");
  }
};

export interface DictionaryResponse {
    shortMeaning: string;
    detailedExplanation: string;
    phonetic: string;
}

export const explainPhrase = async (phrase: string, fullContext: string): Promise<DictionaryResponse> => {
    const cacheKey = phrase.trim().toLowerCase();
    
    // 1. CHECK CACHE
    if (dictionaryCache.has(cacheKey)) return dictionaryCache.get(cacheKey)!;

    // 2. CHECK COOLDOWN / RATE LIMIT / KEY
    if (isSystemInCooldown() || !checkRateLimit() || !apiKey || apiKey.length < 10) {
         try { return await fetchVietnameseFallback(phrase); } 
         catch { return getFallbackDictionary(phrase, "Hệ thống đang bận."); }
    }

    // 3. TRY AI
    try {
        const result = await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: `Define "${phrase}" in Vietnamese (Academic Context). JSON: shortMeaning, phonetic, detailedExplanation.`,
                config: { 
                    responseMimeType: "application/json", 
                    responseSchema: { 
                        type: Type.OBJECT, 
                        properties: { 
                            shortMeaning: {type:Type.STRING}, 
                            phonetic: {type:Type.STRING}, 
                            detailedExplanation: {type:Type.STRING}
                        }
                    }
                }
            });
            let text = response.text || "";
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            if (text) return JSON.parse(text) as DictionaryResponse;
            throw new Error("Empty");
        }); 
        
        dictionaryCache.set(cacheKey, result);
        saveCacheToStorage();
        return result;

    } catch (error) {
        // AI Failed -> Use Fallback
        try { return await fetchVietnameseFallback(phrase); } 
        catch { return getFallbackDictionary(phrase, "Lỗi kết nối."); }
    }
}
