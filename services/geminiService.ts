

import { GoogleGenAI, Type } from "@google/genai";
import { LessonContent, DictionaryResponse } from "../types";
import { translateTextFallback } from "./translationService";
import { fetchCloudDictionary, saveCloudDictionaryItem } from "./firebaseService";

const apiKey = process.env.API_KEY;

// Kiểm tra nhanh định dạng Key để cảnh báo người dùng
if (apiKey && apiKey.startsWith('sk-')) {
    console.error("⚠️ CẢNH BÁO: Bạn đang sử dụng OpenAI Key cho Gemini Service. Vui lòng đổi sang Google Gemini API Key (bắt đầu bằng AIza...)");
}

const genAI = new GoogleGenAI({ apiKey: apiKey || '' });

// Sử dụng model 1.5 Flash (Stable & High Quota)
const MODEL_NAME = "gemini-1.5-flash"; 

// --- CACHE ---
const CACHE_KEY = 'paperlingo_dictionary_cache_v14_gemini'; 
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

// --- HELPER: JSON EXTRACTOR (Robust) ---
const extractJSON = (text: string | undefined): any => {
    if (!text) return null;
    try {
        // 1. Try direct parse
        return JSON.parse(text);
    } catch (e) {
        // 2. Remove Markdown code blocks
        let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").replace(/```/g, "").trim();
        try {
            return JSON.parse(clean);
        } catch (e2) {
            // 3. Try finding JSON object in text
            const start = clean.indexOf('{');
            const end = clean.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                try {
                    return JSON.parse(clean.substring(start, end + 1));
                } catch (e3) {
                    return null;
                }
            }
            return null;
        }
    }
};

const getFallbackLesson = (text: string, translatedText?: string, errorMsg?: string): LessonContent => ({
    cleanedSourceText: text, 
    referenceTranslation: translatedText || "Đang hiển thị bản gốc (Chế độ Offline).",
    keyTerms: [], 
    quiz: [],
    source: 'Fallback'
});

const fetchVietnameseFallback = async (term: string): Promise<DictionaryResponse> => {
    return { shortMeaning: "...", phonetic: "", detailedExplanation: "Không thể kết nối AI." };
};

// --- BATCH HELPER ---
const splitTextIntoSafeBatches = (text: string, batchSize: number = 30000): string[] => {
    const batches = [];
    let currentIndex = 0;
    while (currentIndex < text.length) {
        let endIndex = Math.min(currentIndex + batchSize, text.length);
        if (endIndex < text.length) {
            const lastSafeBreak = text.lastIndexOf('\n\n', endIndex);
            if (lastSafeBreak > currentIndex + batchSize * 0.8) {
                endIndex = lastSafeBreak;
            }
        }
        batches.push(text.substring(currentIndex, endIndex));
        currentIndex = endIndex;
    }
    return batches;
};

// --- CORE FUNCTIONS ---

export const structurePaperWithAI = async (rawText: string): Promise<string[]> => {
    if (!apiKey || apiKey.startsWith('sk-')) {
        console.warn("Invalid API Key for Gemini");
        return [];
    }

    let batches = [rawText];
    // Gemini 1.5 Flash has 1M context, but we limit batch size to ensure output fits in 8k tokens
    if (rawText.length > 80000) {
        batches = splitTextIntoSafeBatches(rawText, 40000);
    }

    const allSections: string[] = [];

    for (let i = 0; i < batches.length; i++) {
        const batchText = batches[i];
        
        try {
            const response = await genAI.models.generateContent({
                model: MODEL_NAME,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: `You are an Academic Editor. Clean and restructure this text.
                            
                            Rules:
                            1. Remove header/footer garbage (e.g. "Downloaded from...", page numbers).
                            2. Merge broken paragraphs.
                            3. Identify main sections (Introduction, Methods, Results, Discussion, Conclusion).
                            4. PRESERVE Appendices and Glossaries if found (Label as ## APPENDIX A).
                            5. Output JSON: { "sections": ["string 1", "string 2"] }
                            
                            Text:
                            """${batchText}"""` }
                        ]
                    }
                ],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            sections: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        }
                    }
                }
            });

            const data = extractJSON(response.text);
            
            if (data && data.sections && Array.isArray(data.sections)) {
                allSections.push(...data.sections);
            } else {
                 allSections.push(batchText); 
            }
        } catch (e) {
            console.warn(`Batch ${i+1} Gemini structure failed.`, e);
            allSections.push(batchText);
        }
    }
    
    return allSections.filter(s => s && s.length > 50);
};

export const generateLessonForChunk = async (textChunk: string, language: 'en' | 'zh' = 'en'): Promise<LessonContent> => {
  if (!apiKey || apiKey.startsWith('sk-')) return getFallbackLesson(textChunk, "Cần Google API Key.");

  try {
    const isChinese = language === 'zh';
    
    const prompt = isChinese
        ? `Task: Create a Traditional Chinese learning lesson.
           Input Text: """${textChunk}"""
           Output JSON:
           {
             "cleanedSourceText": "Cleaned text",
             "referenceTranslation": "Vietnamese translation",
             "keyTerms": [{ "term": "Chinese Word", "meaning": "Vietnamese" }],
             "quiz": [{ "question": "Question in Chinese", "options": ["A", "B", "C"], "correctAnswer": 0, "explanation": "Explanation in Chinese" }]
           }`
        : `Task: Create an Academic English lesson.
           Input Text: """${textChunk}"""
           Output JSON:
           {
             "cleanedSourceText": "Cleaned text (remove citations like [1])",
             "referenceTranslation": "Vietnamese translation (natural, academic style)",
             "keyTerms": [{ "term": "English Term", "meaning": "Vietnamese Meaning" }],
             "quiz": [{ "question": "Question in English", "options": ["A", "B", "C"], "correctAnswer": 0, "explanation": "Explanation in English" }]
           }`;

    const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
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
                            }
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
                            }
                        }
                    }
                }
            }
        }
    });

    const data = extractJSON(response.text);
    if (!data || !data.cleanedSourceText) throw new Error("Invalid JSON");

    return {
        cleanedSourceText: data.cleanedSourceText,
        referenceTranslation: data.referenceTranslation,
        keyTerms: data.keyTerms || [],
        quiz: data.quiz || [],
        source: 'AI'
    };

  } catch (error) {
      console.warn("Gemini Lesson Gen Failed.", error);
      try {
          const translated = await translateTextFallback(textChunk);
          return getFallbackLesson(textChunk, translated);
      } catch (e) {
          return getFallbackLesson(textChunk);
      }
  }
};

export const explainPhrase = async (phrase: string, fullContext: string): Promise<DictionaryResponse> => {
    if (dictionaryCache.has(phrase.toLowerCase())) {
        return dictionaryCache.get(phrase.toLowerCase())!;
    }
    
    if (!apiKey || apiKey.startsWith('sk-')) return fetchVietnameseFallback(phrase);

    try {
        const response = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: [{
                role: 'user',
                parts: [{ text: `Explain term: "${phrase}" in context: "${fullContext}".
                Output JSON:
                {
                  "shortMeaning": "Vietnamese concise meaning",
                  "phonetic": "IPA",
                  "detailedExplanation": "Detailed Vietnamese explanation (2 sentences)"
                }` }]
            }],
            config: { responseMimeType: "application/json" }
        });
        
        const data = extractJSON(response.text);
        const result: DictionaryResponse = {
            shortMeaning: data.shortMeaning || "...",
            phonetic: (data.phonetic || "").replace(/\//g, ''),
            detailedExplanation: data.detailedExplanation || "...",
            originalTerm: phrase
        };

        dictionaryCache.set(phrase.toLowerCase(), result);
        saveCacheToStorage();
        saveCloudDictionaryItem(phrase, result);
        return result;
    } catch (e) {
        return fetchVietnameseFallback(phrase);
    }
};
