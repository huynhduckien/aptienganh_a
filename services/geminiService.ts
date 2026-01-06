
import { DictionaryResponse } from "../types";

/** 
 * LOOKUP: Sử dụng DictionaryAPI.dev và MyMemory 
 * Tốc độ cao, không tốn quota và chính xác cho từ điển chuẩn.
 */
export const lookupTermAI = async (term: string): Promise<DictionaryResponse> => {
    try {
        const cleanTerm = term.trim().toLowerCase();
        
        // 1. Lấy phiên âm và ví dụ từ DictionaryAPI (Tiếng Anh)
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

        // 2. Lấy nghĩa tiếng Việt từ MyMemory API
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

/** 
 * PHRASE EXPLANATION: Kết hợp dịch và tra cứu nhanh
 */
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
