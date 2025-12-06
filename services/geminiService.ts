
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonContent } from "../types";
import { translateTextFallback } from "./translationService";

// Khởi tạo AI Client
const apiKey = process.env.API_KEY;

// DEBUG LOGGING - GIÚP BẠN KIỂM TRA TRÊN VERCEL
console.log("Checking API Key status:", apiKey ? "✅ Key Found (" + apiKey.substring(0, 5) + "...)" : "❌ Key Missing (Value is empty)");

if (!apiKey || apiKey.length < 10) {
    console.warn("⚠️ API Key đang bị RỖNG hoặc KHÔNG HỢP LỆ. Web sẽ chạy chế độ Fallback.");
} 

const ai = new GoogleGenAI({ apiKey: apiKey || "dummy_key_to_prevent_crash_on_init" });

// Use standard Flash model for better quality translation
const MODEL_NAME = "gemini-2.0-flash-lite-preview-02-05";

// --- PERSISTENT CACHE ---
const CACHE_KEY = 'paperlingo_dictionary_cache_v8'; 
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

// IMPROVED FALLBACK
const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    let phonetic = "";
    let definitionEN = "";
    let partOfSpeech = "";

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
        if (response.ok) {
            const data = await response.json();
            const firstEntry = data[0];
            
            // Phonetic Logic: Prioritize ones with audio or text
            if (firstEntry.phonetics && Array.isArray(firstEntry.phonetics)) {
                // Find one that looks like IPA (has slashes)
                const ipa = firstEntry.phonetics.find((p: any) => p.text && p.text.includes('/'));
                const anyP = firstEntry.phonetics.find((p: any) => p.text);
                
                phonetic = ipa?.text || anyP?.text || "";
            }
            if (!phonetic && firstEntry.phonetic) {
                phonetic = firstEntry.phonetic;
            }
            
            // Clean phonetic: Remove existing slashes so UI can add them consistently
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

// Helper to reliably extract JSON
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

// Aggressive cleaner for Tooltip (Short Meaning)
// STRICTLY removes brackets but ALLOWS longer text for accuracy
const cleanShortMeaning = (text: string): string => {
    let cleaned = text;
    
    // 1. Remove anything inside round brackets (...) or square brackets [...]
    // This removes parts of speech like (noun) or notes
    cleaned = cleaned.replace(/[\(\[].*?[\)\]]/g, '');
    
    // 2. Remove common prefixes/suffixes AI adds
    cleaned = cleaned.replace(/^nghĩa là\s+/i, '');
    cleaned = cleaned.replace(/^là\s+/i, '');

    // 3. We NO LONGER split by commas to allow synonyms or full phrases.
    // But we still split by semicolon if AI gives multiple distinct definitions.
    cleaned = cleaned.split(/[;]/)[0];
    
    // 4. Trim spaces
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
}

export const explainPhrase = async (phrase: string, fullContext: string): Promise<DictionaryResponse> => {
    const cacheKey = phrase.trim().toLowerCase();
    if (dictionaryCache.has(cacheKey)) return dictionaryCache.get(cacheKey)!;

    // Fast fail to fallback if rate limit or no key
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
                
                OUTPUT JSON ONLY with this exact structure:
                {
                  "shortMeaning": "TRANSLATE term to Vietnamese accurately. Keep it concise but ensure the FULL meaning is conveyed. NO brackets. NO parts of speech. NO explanations.",
                  "phonetic": "IPA format (JUST text, e.g. wɜːrd, NO slashes)",
                  "detailedExplanation": "Explain the meaning and usage in this context in Vietnamese. You can include part of speech and detailed nuance here."
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
        
        // Aggressive cleaning
        result.shortMeaning = cleanShortMeaning(result.shortMeaning);
        // Ensure phonetic has no slashes (so UI can add them)
        if (result.phonetic) {
            result.phonetic = result.phonetic.replace(/^[\/\[]/, '').replace(/[\/\]]$/, '');
        }
        
        dictionaryCache.set(cacheKey, result);
        saveCacheToStorage();
        return result;

    } catch (error) {
        return await fetchVietnameseFallback(phrase);
    }
}
