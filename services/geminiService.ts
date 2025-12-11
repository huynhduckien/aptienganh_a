import { GoogleGenAI, Type } from "@google/genai";
import { DictionaryResponse, LessonContent } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MODEL_NAME = "gemini-2.5-flash"; 

const extractJSON = (text: string | undefined): any => {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (e) {
        let clean = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").replace(/```/g, "").trim();
        try { return JSON.parse(clean); } catch (e2) { return null; }
    }
};

// Hàm tra cứu từ vựng thông minh cho tính năng Add Card
export const lookupTermAI = async (term: string): Promise<DictionaryResponse> => {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Dictionary Task.
                Term: "${term}"
                Target Language: Vietnamese (for meaning/explanation)
                
                Output JSON:
                {
                  "shortMeaning": "Nghĩa ngắn gọn (Tiếng Việt)",
                  "phonetic": "IPA (e.g. /.../)",
                  "detailedExplanation": "Một câu ví dụ (Tiếng Anh) và dịch nghĩa câu đó (Tiếng Việt). Ví dụ: 'Hello (Xin chào).'"
                }`,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        shortMeaning: { type: Type.STRING },
                        phonetic: { type: Type.STRING },
                        detailedExplanation: { type: Type.STRING },
                    }
                }
            }
        });
        
        const data = extractJSON(response.text);
        
        return {
            shortMeaning: data?.shortMeaning || "...",
            phonetic: (data?.phonetic || "").replace(/\//g, ''),
            detailedExplanation: data?.detailedExplanation || "",
            originalTerm: term
        };

    } catch (e) {
        console.error("Gemini Lookup Failed", e);
        return { shortMeaning: "", phonetic: "", detailedExplanation: "Lỗi kết nối AI.", originalTerm: term };
    }
};

export const structurePaperWithAI = async (text: string): Promise<string[]> => {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: `You are an expert academic paper editor.
            Task: Organize the following raw text from a PDF into clear, coherent reading sections.
            1. Remove noise (page numbers, running headers, references lists, copyright info).
            2. Group related paragraphs into logical sections (Introduction, Methods, Results, etc.).
            3. If a section is very long, split it into smaller logical parts (approx 300-500 words).
            4. Return the result as a JSON array of strings, where each string is a section content.
            5. Add a Markdown header (e.g., ## Introduction) at the start of each section if applicable.

            Raw Text:
            ${text.substring(0, 50000)}`, // Limit context if necessary, though 2.5 Flash has large context
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });
        const json = extractJSON(response.text);
        if (Array.isArray(json)) return json;
        return [];
    } catch (e) {
        console.warn("AI Structure failed", e);
        return [];
    }
};

export const generateLessonForChunk = async (text: string, language: 'en' | 'zh'): Promise<LessonContent> => {
    try {
        const prompt = `
        Task: Create a language learning lesson from this text.
        Target Language for explanation: Vietnamese.
        Source Text (${language === 'en' ? 'English' : 'Traditional Chinese'}): "${text}"

        1. Clean the source text (remove citations like [1], (Smith 2020), typos, line breaks).
        2. Translate the cleaned text into natural Vietnamese.
        3. Create 3 reading comprehension quiz questions (in Vietnamese) based on the text.

        Output JSON:
        {
            "cleanedSourceText": "...",
            "referenceTranslation": "...",
            "quiz": [
                {
                    "question": "...",
                    "options": ["A...", "B...", "C...", "D..."],
                    "correctAnswer": 0, // Index 0-3
                    "explanation": "..."
                }
            ]
        }
        `;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        cleanedSourceText: { type: Type.STRING },
                        referenceTranslation: { type: Type.STRING },
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
        return {
            cleanedSourceText: data?.cleanedSourceText || text,
            referenceTranslation: data?.referenceTranslation || "",
            quiz: data?.quiz || [],
            source: 'AI'
        };
    } catch (e) {
         console.error("Generate Lesson Failed", e);
         return {
             cleanedSourceText: text,
             referenceTranslation: "Lỗi kết nối AI hoặc hết quota.",
             quiz: [],
             source: 'Fallback'
         };
    }
};

export const explainPhrase = async (phrase: string, context: string): Promise<DictionaryResponse> => {
    try {
        const prompt = `
        Task: Explain the phrase/word "${phrase}" found in this context: "${context.substring(0, 500)}...".
        Target Language: Vietnamese.

        Output JSON:
        {
            "shortMeaning": "Meaning in Vietnamese",
            "phonetic": "IPA",
            "detailedExplanation": "English definition + Example sentence with Vietnamese translation."
        }
        `;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        shortMeaning: { type: Type.STRING },
                        phonetic: { type: Type.STRING },
                        detailedExplanation: { type: Type.STRING }
                    }
                }
            }
        });

        const data = extractJSON(response.text);
        return {
            shortMeaning: data?.shortMeaning || "...",
            phonetic: data?.phonetic || "",
            detailedExplanation: data?.detailedExplanation || "",
            originalTerm: phrase
        };
    } catch (e) {
        return { shortMeaning: "", phonetic: "", detailedExplanation: "Lỗi kết nối AI.", originalTerm: phrase };
    }
};