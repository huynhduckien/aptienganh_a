
import { Flashcard } from "../types";
import { DictionaryResponse } from "./geminiService";

// URL Firebase chính thức của bạn
const FIREBASE_URL = "https://nail-schedule-test-default-rtdb.europe-west1.firebasedatabase.app/";

// --- FLASHCARDS ---

export const fetchCloudFlashcards = async (): Promise<Flashcard[]> => {
  try {
    const response = await fetch(`${FIREBASE_URL}/paperlingo/flashcards.json`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data) return [];

    // Firebase trả về Object { "id1": {...}, "id2": {...} }, cần chuyển về Array
    return Object.values(data);
  } catch (error) {
    console.warn("Cloud flashcards fetch failed", error);
    return [];
  }
};

export const saveCloudFlashcard = async (card: Flashcard): Promise<void> => {
  try {
    // Dùng PUT để ghi đè theo ID (Upsert)
    await fetch(`${FIREBASE_URL}/paperlingo/flashcards/${card.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(card),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud flashcard save failed", error);
  }
};

// --- DICTIONARY CACHE ---

// Tải toàn bộ từ điển đã tra từ trên mây về
export const fetchCloudDictionary = async (): Promise<Record<string, DictionaryResponse>> => {
  try {
    const response = await fetch(`${FIREBASE_URL}/paperlingo/dictionary.json`);
    if (!response.ok) return {};
    
    const data = await response.json();
    return data || {};
  } catch (error) {
    console.warn("Cloud dictionary fetch failed", error);
    return {};
  }
};

// Lưu một từ mới lên mây
export const saveCloudDictionaryItem = async (term: string, data: DictionaryResponse): Promise<void> => {
  try {
    // Firebase key không được chứa ký tự đặc biệt như dấu chấm, $, #, [, ], /
    // Chúng ta encode base64 key hoặc đơn giản là replace
    const safeKey = btoa(term.trim().toLowerCase()).replace(/=/g, ''); 
    
    await fetch(`${FIREBASE_URL}/paperlingo/dictionary/${safeKey}.json`, {
      method: 'PUT',
      body: JSON.stringify({ ...data, originalTerm: term }),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud dictionary item save failed", error);
  }
};
