

import { Flashcard, StudentAccount, ReviewLog, DictionaryResponse } from "../types";

// URL Firebase chính thức của bạn
const FIREBASE_URL = "https://nail-schedule-test-default-rtdb.europe-west1.firebasedatabase.app/";

let currentSyncKey: string | null = null;

export const setFirebaseSyncKey = (key: string) => {
    currentSyncKey = key;
};

// --- FLASHCARDS (User Specific) ---

export const fetchCloudFlashcards = async (): Promise<Flashcard[]> => {
  if (!currentSyncKey) return []; // Không có key thì không load
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards.json`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data) return [];

    return Object.values(data);
  } catch (error) {
    console.warn("Cloud flashcards fetch failed", error);
    return [];
  }
};

export const saveCloudFlashcard = async (card: Flashcard): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards/${card.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(card),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud flashcard save failed", error);
  }
};

// --- REVIEW LOGS (User Specific - NEW for Statistics) ---

export const fetchCloudReviewLogs = async (): Promise<ReviewLog[]> => {
  if (!currentSyncKey) return [];
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/logs.json`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data) return [];

    return Object.values(data);
  } catch (error) {
    console.warn("Cloud logs fetch failed", error);
    return [];
  }
};

export const saveCloudReviewLog = async (log: ReviewLog): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/logs/${log.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(log),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud log save failed", error);
  }
};

// --- DICTIONARY CACHE (Global Shared) ---

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

export const saveCloudDictionaryItem = async (term: string, data: DictionaryResponse): Promise<void> => {
  try {
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

// --- ADMIN MANAGEMENT ---

export const createStudentAccount = async (name: string): Promise<StudentAccount> => {
    // Tạo key ngẫu nhiên dễ nhớ hơn UUID: tên-số (ví dụ: hieu-8392)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${safeName}-${randomSuffix}`;
    
    const newStudent: StudentAccount = {
        key,
        name,
        createdAt: Date.now()
    };

    try {
        await fetch(`${FIREBASE_URL}/admin/students/${key}.json`, {
            method: 'PUT',
            body: JSON.stringify(newStudent),
            headers: { 'Content-Type': 'application/json' }
        });
        return newStudent;
    } catch (e) {
        throw new Error("Không thể tạo tài khoản học viên");
    }
};

export const getAllStudents = async (): Promise<StudentAccount[]> => {
    try {
        const response = await fetch(`${FIREBASE_URL}/admin/students.json`);
        if (!response.ok) return [];
        const data = await response.json();
        return data ? Object.values(data) : [];
    } catch (e) {
        return [];
    }
};

// Kiểm tra xem key học viên nhập có tồn tại trong hệ thống không
export const verifyStudentKey = async (key: string): Promise<StudentAccount | null> => {
    try {
        const response = await fetch(`${FIREBASE_URL}/admin/students/${key}.json`);
        if (!response.ok) return null;
        const data = await response.json();
        return data || null;
    } catch (e) {
        return null;
    }
};