
import { Flashcard, StudentAccount, ReviewLog, DictionaryResponse, Deck, TranslationRecord } from "../types";

const FIREBASE_URL = "https://nail-schedule-test-default-rtdb.europe-west1.firebasedatabase.app"; 

let currentSyncKey: string | null = null;

export const setFirebaseSyncKey = (key: string) => {
    currentSyncKey = key;
};

// --- TRANSLATIONS (User Specific) ---

export const fetchCloudTranslations = async (): Promise<TranslationRecord[]> => {
  if (!currentSyncKey) return [];
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/translations.json`);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data) return [];
    return Object.values(data);
  } catch (error) {
    console.warn("Cloud translations fetch failed", error);
    return [];
  }
};

export const saveCloudTranslation = async (record: TranslationRecord): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/translations/${record.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(record),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud translation save failed", error);
  }
};

export const deleteCloudTranslation = async (recordId: string): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/translations/${recordId}.json`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.warn("Cloud translation delete failed", error);
  }
};

// --- FLASHCARDS (User Specific) ---

export const fetchCloudFlashcards = async (): Promise<Flashcard[]> => {
  if (!currentSyncKey) return []; 
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards.json`);
    if (!response.ok) {
        console.error(`Firebase Error: ${response.status} ${response.statusText}`);
        return [];
    }
    
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
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards/${card.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(card),
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) console.error("Save Cloud Card Failed", response.statusText);
  } catch (error) {
    console.warn("Cloud flashcard save failed", error);
  }
};

export const deleteCloudFlashcard = async (cardId: string): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards/${cardId}.json`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.warn("Cloud flashcard delete failed", error);
  }
};

// --- DECKS (User Specific) ---

export const fetchCloudDecks = async (): Promise<Deck[]> => {
  if (!currentSyncKey) return [];
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/decks.json`);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data) return [];
    return Object.values(data);
  } catch (error) {
    console.warn("Cloud decks fetch failed", error);
    return [];
  }
};

export const saveCloudDeck = async (deck: Deck): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/decks/${deck.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(deck),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud deck save failed", error);
  }
};

export const deleteCloudDeck = async (deckId: string): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/decks/${deckId}.json`, {
      method: 'DELETE'
    });
  } catch (error) {
      console.warn("Cloud deck delete failed", error);
  }
};

// --- REVIEW LOGS ---

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

// --- ADMIN MANAGEMENT ---

export const createStudentAccount = async (name: string): Promise<StudentAccount> => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${safeName}-${randomSuffix}`;
    
    const newStudent: StudentAccount = {
        key,
        name,
        createdAt: Date.now()
    };

    try {
        const response = await fetch(`${FIREBASE_URL}/admin/students/${key}.json`, {
            method: 'PUT',
            body: JSON.stringify(newStudent),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error("Firebase error");
        return newStudent;
    } catch (e) {
        console.error(e);
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

export const verifyStudentKey = async (key: string): Promise<StudentAccount | null> => {
    try {
        const response = await fetch(`${FIREBASE_URL}/admin/students/${key}.json`);
        if (!response.ok) {
            console.error("Verify Key Failed:", response.status, response.statusText);
            return null;
        }
        const data = await response.json();
        return data || null;
    } catch (e) {
        console.error("Verify Key Network Error:", e);
        return null;
    }
};
