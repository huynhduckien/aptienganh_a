
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonContent } from "../types";
import { translateTextFallback } from "./translationService";
import { fetchCloudDictionary, saveCloudDictionaryItem } from "./firebaseService";

// Khởi tạo AI Client
const apiKey = process.env.API_KEY;

// DEBUG LOGGING
console.log("Checking API Key status:", apiKey ? "✅ Key Found" : "❌ Key Missing");

if (!apiKey || apiKey.length < 10) {
    console.warn("⚠️ API Key đang bị RỖNG hoặc KHÔNG HỢP LỆ. Web sẽ chạy chế độ Fallback.");
} 

const ai = new GoogleGenAI({ apiKey: apiKey || "dummy_key_to_prevent_crash_on_init" });
const MODEL_NAME = "gemini-2.0-flash-lite-preview-02-05";

// --- PERSISTENT CACHE (Local + Cloud) ---
const CACHE_KEY = 'paperlingo_dictionary_cache_v8'; 
let dictionaryCache = new Map<string, DictionaryResponse>();

// Hàm khởi tạo Cache: Local + Cloud
const initCache = async () => {
    // 1. Load LocalStorage
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            dictionaryCache = new Map(JSON.parse(stored));
        }
    } catch (e) {
        console.warn("Failed to load local dictionary cache", e);
    }

    // 2. Load Cloud (Firebase) -> Merge vào Local
    if (navigator.onLine) {
        try {
            const cloudDict = await fetchCloudDictionary();
            let hasUpdate = false;
            Object.values(cloudDict).forEach((item: any) => {
                if (item.originalTerm) {
                    const key = item.originalTerm.trim().toLowerCase();
                    if (!dictionaryCache.has(key)) {
                        dictionaryCache.set(key, item);
                        hasUpdate = true;
                    }
                }
            });
            if (hasUpdate) {
                saveCacheToStorage();
            }
        } catch (e) {
            console.warn("Failed to sync cloud dictionary", e);
        }
    }
};

// Gọi khởi tạo ngay
initCache();

const saveCacheToStorage = () => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(dictionaryCache.entries())));
    } catch (e) {
        console.warn("Failed to save dictionary cache", e);
    }
};

// --- RATE LIMITER CONFIGURATION ---
const MAX_REQUESTS_PER_MINUTE = 15;
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

const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    let phonetic = "";
    let definitionEN = "";
    let partOfSpeech = "";

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
        if (response.ok) {
            const data = await response.json();
            const firstEntry = data[0];
            
            if (firstEntry.phonetics && Array.isArray(firstEntry.phonetics)) {
                // Find pure IPA (text inside slashes /.../)
                const ipa = firstEntry.phonetics.find((p: any) => p.text && p.text.trim().match(/^\/.*\/$/));
                // Find any text
                const anyP = firstEntry.phonetics.find((p: any) => p.text);
                
                phonetic = ipa?.text || anyP?.text || "";
            }
            if (!phonetic && firstEntry.phonetic) {
                phonetic = firstEntry.phonetic;
            }
            
            // Cleanup phonetic: ensure no brackets for consistency
            if (phonetic) {
                phonetic = phonetic.replace(/^[\/\[]/, '').replace(/[\/\]]$/, '');
            }

            if (firstEntry.meanings && firstEntry.meanings.length > 0) {
                partOfSpeech = firstEntry.meanings[0].partOfSpeech || "";
                definitionEN = firstEntry.meanings[0].definitions[0]?.definition || "";
            }
        }
    } catch (e) { 
        console.warn("Dictionary API failed", e);
    }

    let vietnameseMeaning = "";
    try {
        vietnameseMeaning = await translateTextFallback(term);
    } catch (e) {
        vietnameseMeaning = "Đang tải...";
    }

    const explanation = partOfSpeech 
        ? `(${partOfSpeech}) ${definitionEN}` 
        : `Dịch máy: ${vietnameseMeaning}`;

    return {
        shortMeaning: vietnameseMeaning,
        phonetic: phonetic, 
        detailedExplanation: explanation
    };
};

const extractJSON = (text: string): any => {
    try {
        return JSON.parse(text);
    } catch (e) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {
                console.error("Failed to parse extracted JSON block", e2);
            }
        }
        throw new Error("Invalid JSON format");
    }
};

const cleanShortMeaning = (text: string): string => {
    let cleaned = text;
    // Strictly remove content in brackets
    cleaned = cleaned.replace(/[\(\[].*?[\)\]]/g, '');
    cleaned = cleaned.replace(/^nghĩa là\s+/i, '');
    cleaned = cleaned.replace(/^là\s+/i, '');
    // Split by semicolon to keep main meanings
    cleaned = cleaned.split(/[;]/)[0];
    cleaned = cleaned.trim();
    return cleaned;
};

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

            const data = extractJSON(response.text || "{}") as LessonContent;
            data.source = 'AI';
            return data;
          });
      } catch (error: any) {
          console.warn("AI Failed. Switching to Fallback.", error.message);
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
    originalTerm?: string; // Used for cloud sync
}

export const explainPhrase = async (phrase: string, fullContext: string): Promise<DictionaryResponse> => {
    const cacheKey = phrase.trim().toLowerCase();
    
    // 1. Check Cache (Local or loaded from Cloud)
    if (dictionaryCache.has(cacheKey)) return dictionaryCache.get(cacheKey)!;

    // Fast fail check
    if (!checkRateLimit() || !apiKey || apiKey.length < 10) {
         return await fetchVietnameseFallback(phrase);
    }

    try {
        const result = await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: `
                Act as a Dictionary for an Academic English learner.
                Term: "${phrase}"
                Context: "${fullContext}"
                
                OUTPUT JSON ONLY:
                {
                  "shortMeaning": "TRANSLATE term to Vietnamese. Concise.",
                  "phonetic": "IPA format (JUST text, e.g. wɜːrd, NO slashes)",
                  "detailedExplanation": "Explain meaning and usage in this context in Vietnamese."
                }
                `,
                config: { 
                    responseMimeType: "application/json", 
                    responseSchema: { 
                        type: Type.OBJECT, 
                        properties: { 
                            shortMeaning: {type:Type.STRING}, 
                            phonetic: {type:Type.STRING}, 
                            detailedExplanation: {type:Type.STRING}
                        },
                        required: ["shortMeaning", "phonetic", "detailedExplanation"]
                    }
                }
            });
            
            return extractJSON(response.text || "{}") as DictionaryResponse;
        }, 1, 1000); 
        
        // Clean and Cache
        result.shortMeaning = cleanShortMeaning(result.shortMeaning);
        if (result.phonetic) {
            result.phonetic = result.phonetic.replace(/^[\/\[]/, '').replace(/[\/\]]$/, '');
        }
        
        dictionaryCache.set(cacheKey, result);
        saveCacheToStorage();
        
        // 2. Sync new term to Cloud (Background)
        saveCloudDictionaryItem(phrase, result);
        
        return result;

    } catch (error) {
        return await fetchVietnameseFallback(phrase);
    }
}
