
// Service for non-AI translation fallback
// Using MyMemory API (Free, no key required for low usage)

export const translateTextFallback = async (text: string, sourceLang = 'en', targetLang = 'vi'): Promise<string> => {
  try {
    // Basic cleaning before sending to translation API
    const cleanText = text.replace(/\n/g, ' ').trim();
    
    if (!cleanText) return "";

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${sourceLang}|${targetLang}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
    
    throw new Error("Translation API format changed");
  } catch (error) {
    console.warn("Fallback translation failed:", error);
    return "Không thể dịch đoạn này do lỗi kết nối. Vui lòng thử lại.";
  }
};
