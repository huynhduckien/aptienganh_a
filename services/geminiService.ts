
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

// --- CACHE & RATE LIMITER ---
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

// SCHEMA
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
    quiz: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.INTEGER },
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

// DICTIONARY HELPER
const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
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

// GENERATE LESSON
export const generateLessonForChunk = async (textChunk: string, language: 'en' | 'zh' = 'en'): Promise<LessonContent> => {
  const isValidKey = apiKey && apiKey.length > 10 && apiKey !== "dummy_key_to_prevent_crash_on_init";
  
  if (isValidKey) {
      try {
          return await withRetry(async () => {
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
                ROLE: Strict Academic Content Filter & Editor.
                INPUT TEXT (English): "${textChunk}"

                YOUR PRIORITY MISSION: 
                Clean the text. You must ONLY output content that belongs to the following sections:
                - INTRODUCTION
                - METHODS / METHODOLOGY
                - RESULTS / FINDINGS
                - DISCUSSION / CONCLUSION
                
                STRICTLY DELETE ANY CONTENT THAT IS:
                - Abstract, Title, Keywords
                - Author names, Affiliations, Emails
                - Acknowledgements, Funding, Data Availability
                - References / Bibliography
                - Metadata, Journal Headers, Page numbers
                
                If the chunk consists ONLY of deleted content (e.g. it is just the Abstract or References), return an empty string for "cleanedSourceText".

                TASKS:
                1. "cleanedSourceText": The cleaned English text (Intro/Method/Result/Conclusion ONLY). Fix newlines.
                2. "referenceTranslation": Translate the CLEANED text to Vietnamese (Academic style).
                3. "keyTerms": Extract 3 difficult terms (English + Vietnamese).
                4. "quiz": Generate 2 multiple choice questions (A, B, C) in Vietnamese based on the CLEANED text.
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
            
            let cleanShort = raw.shortMeaning || "";
            cleanShort = cleanShort.replace(/[\(\[].*?[\)\]]/g, "");
            cleanShort = cleanShort.trim();

            const result: DictionaryResponse = {
                shortMeaning: cleanShort,
                phonetic: (raw.phonetic || "").replace(/\//g, ''), 
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
