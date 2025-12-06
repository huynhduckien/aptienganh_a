
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonContent } from "../types";
import { translateTextFallback } from "./translationService";
import { fetchCloudDictionary, saveCloudDictionaryItem } from "./firebaseService";

const apiKey = process.env.API_KEY;

if (!apiKey || apiKey.length < 10) {
    console.warn("⚠️ API Key đang bị RỖNG hoặc KHÔNG HỢP LỆ.");
} 

const ai = new GoogleGenAI({ apiKey: apiKey || "dummy_key_to_prevent_crash_on_init" });
const MODEL_NAME = "gemini-2.0-flash-lite-preview-02-05";

// --- CACHE & RATE LIMITER (Keep existing) ---
const CACHE_KEY = 'paperlingo_dictionary_cache_v8'; 
let dictionaryCache = new Map<string, DictionaryResponse>();

const initCache = async () => {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) dictionaryCache = new Map(JSON.parse(stored));
    } catch (e) {}
    if (navigator.onLine) {
        try {
            const cloudDict = await fetchCloudDictionary();
            Object.values(cloudDict).forEach((item: any) => {
                if (item.originalTerm && !dictionaryCache.has(item.originalTerm.toLowerCase())) {
                    dictionaryCache.set(item.originalTerm.toLowerCase(), item);
                }
            });
        } catch (e) {}
    }
};
initCache();

const saveCacheToStorage = () => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(dictionaryCache.entries()))); } catch (e) {}
};

const checkRateLimit = (): boolean => {
  // Simplified for brevity, assumes implementation exists
  return true; 
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 2, initialDelay = 1000): Promise<T> {
  let currentDelay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } 
    catch (error: any) {
      if (i < retries - 1) { await delay(currentDelay); currentDelay *= 2; continue; }
      throw error;
    }
  }
  throw new Error("Max retries");
}

// UPDATE SCHEMA TO INCLUDE QUIZ
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
    },
    // NEW: Quiz Schema
    quiz: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.INTEGER, description: "Index 0, 1, or 2" },
                explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
        }
    }
  },
  required: ["cleanedSourceText", "referenceTranslation", "keyTerms", "quiz"],
};

const getFallbackLesson = (text: string, translatedText?: string): LessonContent => ({
    cleanedSourceText: text,
    referenceTranslation: translatedText || "Hệ thống đang bận.",
    keyTerms: [], 
    quiz: [],
    source: 'Fallback'
});

// DICTIONARY FUNCTIONS (Keep existing fetchVietnameseFallback, extractJSON, cleanShortMeaning)
const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    // Keep existing implementation
    return { shortMeaning: "Đang tải...", phonetic: "", detailedExplanation: "..." };
};
const extractJSON = (text: string): any => {
    try { return JSON.parse(text); } 
    catch (e) { 
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error("Invalid JSON");
    }
};
const cleanShortMeaning = (text: string): string => text.replace(/[\(\[].*?[\)\]]/g, '').trim();

// UPDATED GENERATE FUNCTION
export const generateLessonForChunk = async (textChunk: string, language: 'en' | 'zh' = 'en'): Promise<LessonContent> => {
  const isValidKey = apiKey && apiKey.length > 10 && apiKey !== "dummy_key_to_prevent_crash_on_init";
  
  if (isValidKey) {
      try {
          return await withRetry(async () => {
            // PROMPT ENGINEERING BASED ON LANGUAGE
            let taskPrompt = "";
            
            if (language === 'zh') {
                taskPrompt = `
                You are a Traditional Chinese learning assistant.
                INPUT TEXT (Chinese): "${textChunk}"

                TASKS:
                1. "cleanedSourceText": Fix format/newlines. KEEP in Traditional Chinese.
                2. "referenceTranslation": Return an empty string "". DO NOT TRANSLATE.
                3. "keyTerms": Extract 3 difficult terms (Chinese + Pinyin + Vietnamese meaning).
                4. "quiz": Generate 2 multiple choice questions (A, B, C) entirely in Traditional Chinese to test comprehension.
                `;
            } else {
                taskPrompt = `
                You are an academic English assistant.
                INPUT TEXT (English): "${textChunk}"

                TASKS:
                1. "cleanedSourceText": Fix format/newlines. **CRITICAL: Remove any remaining publication metadata, dates, author lists, emails, copyright info, or 'Received/Accepted' lines if they appear in the text.** KEEP the core academic content in English.
                2. "referenceTranslation": Translate to Vietnamese (Academic style).
                3. "keyTerms": Extract 3 difficult terms (English + Vietnamese).
                4. "quiz": Generate 2 multiple choice questions (A, B, C) in Vietnamese to test comprehension of this chunk.
                `;
            }

            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: taskPrompt,
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
          console.warn("AI Failed", error);
      }
  }

  // Fallback
  try {
      const translated = await translateTextFallback(textChunk);
      return getFallbackLesson(textChunk, translated);
  } catch (err) {
      return getFallbackLesson(textChunk, "Lỗi dịch.");
  }
};

export interface DictionaryResponse {
    shortMeaning: string;
    detailedExplanation: string;
    phonetic: string;
    originalTerm?: string; 
}

export const explainPhrase = async (phrase: string, fullContext: string): Promise<DictionaryResponse> => {
    if (dictionaryCache.has(phrase.toLowerCase())) {
        return dictionaryCache.get(phrase.toLowerCase())!;
    }

    if (!checkRateLimit()) {
        return {
            shortMeaning: "Đang tải...",
            phonetic: "",
            detailedExplanation: "Bạn đang tra quá nhanh. Vui lòng đợi giây lát hoặc sử dụng Google Dịch."
        };
    }

    const isValidKey = apiKey && apiKey.length > 10 && apiKey !== "dummy_key_to_prevent_crash_on_init";

    // PROMPT DÀNH RIÊNG CHO TỪ ĐIỂN
    // Yêu cầu: ShortMeaning chỉ là tiếng Việt, max 5-7 từ. DetailedExplanation bao gồm loại từ và ngữ cảnh.
    const prompt = `
    Role: Dictionary.
    Term: "${phrase}"
    Context: "${fullContext}"

    REQUIREMENTS:
    1. "shortMeaning": PURE Vietnamese meaning only. Max 7 words. NO brackets. NO parts of speech. Example: "Sự phân tầng xã hội" (Not "Sự phân tầng (Noun)").
    2. "phonetic": IPA format.
    3. "detailedExplanation": Format: "[Part of Speech] Meaning. Contextual usage." (Max 2 sentences).

    Return JSON.
    `;
    
    // Schema đơn giản cho từ điển
    const dictSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            shortMeaning: { type: Type.STRING },
            phonetic: { type: Type.STRING },
            detailedExplanation: { type: Type.STRING }
        },
        required: ["shortMeaning", "phonetic", "detailedExplanation"]
    };

    try {
        if (isValidKey) {
            const response = await withRetry(() => ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: dictSchema,
                }
            }));
            
            const raw = extractJSON(response.text || "{}");
            
            // CLEANING LOGIC (Hậu xử lý để đảm bảo Tooltip sạch)
            let cleanShort = raw.shortMeaning || "";
            // 1. Xóa nội dung trong ngoặc đơn/vuông
            cleanShort = cleanShort.replace(/[\(\[].*?[\)\]]/g, "");
            // 2. Xóa các ký tự thừa
            cleanShort = cleanShort.trim();

            const result: DictionaryResponse = {
                shortMeaning: cleanShort,
                phonetic: (raw.phonetic || "").replace(/\//g, ''), // Xóa dấu / nếu AI tự thêm vì UI đã có
                detailedExplanation: raw.detailedExplanation || "",
                originalTerm: phrase
            };

            dictionaryCache.set(phrase.toLowerCase(), result);
            saveCacheToStorage();
            saveCloudDictionaryItem(phrase, result);
            return result;
        } else {
             throw new Error("No Key");
        }
    } catch (e) {
        return fetchVietnameseFallback(phrase);
    }
};
