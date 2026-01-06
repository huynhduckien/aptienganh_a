
import { GoogleGenAI, Type } from "@google/genai";
import { DictionaryResponse, GradingResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/** 
 * LOOKUP: Sử dụng DictionaryAPI.dev và MyMemory 
 */
export const lookupTermAI = async (term: string): Promise<DictionaryResponse> => {
    try {
        const cleanTerm = term.trim().toLowerCase();
        
        let phonetic = "";
        let example = "";
        try {
            const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanTerm}`);
            if (dictRes.ok) {
                const dictData = await dictRes.json();
                phonetic = dictData[0]?.phonetic || dictData[0]?.phonetics?.find((p: any) => p.text)?.text || "";
                const definitionObj = dictData[0]?.meanings[0]?.definitions?.find((d: any) => d.example);
                example = definitionObj?.example || "";
            }
        } catch (e) { console.warn("DictionaryAPI failed", e); }

        let shortMeaning = "Chưa tìm thấy nghĩa.";
        try {
            const transRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanTerm)}&langpair=en|vi`);
            if (transRes.ok) {
                const transData = await transRes.json();
                shortMeaning = transData.responseData.translatedText;
            }
        } catch (e) { console.warn("MyMemory failed", e); }

        return {
            shortMeaning,
            phonetic: phonetic.replace(/\//g, ''),
            detailedExplanation: example ? `Ví dụ: ${example}` : "Không có ví dụ mẫu.",
            originalTerm: term
        };

    } catch (e) {
        console.error("Lookup Failed", e);
        return { shortMeaning: "Lỗi kết nối", phonetic: "", detailedExplanation: "Vui lòng kiểm tra mạng.", originalTerm: term };
    }
};

export const explainPhrase = async (phrase: string, context: string): Promise<DictionaryResponse> => {
    if (phrase.split(/\s+/).length > 1) {
        try {
            const transRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(phrase)}&langpair=en|vi`);
            const transData = await transRes.json();
            return {
                shortMeaning: transData.responseData.translatedText,
                phonetic: "",
                detailedExplanation: `Dịch cụm từ theo ngữ cảnh.`,
                originalTerm: phrase
            };
        } catch (e) {
            return { shortMeaning: phrase, phonetic: "", detailedExplanation: "Lỗi dịch cụm từ.", originalTerm: phrase };
        }
    }
    return lookupTermAI(phrase);
};

/**
 * GRADING: Chấm điểm bản dịch của người dùng
 */
export const gradeTranslation = async (sourceText: string, userTranslation: string): Promise<GradingResult> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
      Bạn là một chuyên gia dịch thuật và giáo viên ngôn ngữ. Hãy chấm điểm bản dịch sau.
      
      VĂN BẢN GỐC: "${sourceText}"
      BẢN DỊCH CỦA NGƯỜI DÙNG: "${userTranslation}"
      
      Hãy đánh giá dựa trên:
      1. Độ chính xác về nghĩa (Accuracy).
      2. Sự tự nhiên và trôi chảy (Fluency).
      3. Ngữ pháp và từ vựng (Grammar/Vocabulary).
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: "Điểm từ 0 đến 100" },
          feedback: { type: Type.STRING, description: "Nhận xét tổng quan ngắn gọn" },
          modelTranslation: { type: Type.STRING, description: "Bản dịch mẫu tối ưu nhất" },
          strengths: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Những điểm tốt trong bản dịch"
          },
          improvements: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Những điểm cần cải thiện hoặc sửa lỗi"
          }
        },
        required: ["score", "feedback", "modelTranslation", "strengths", "improvements"]
      }
    }
  });

  return JSON.parse(response.text);
};
