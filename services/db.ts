
import { Flashcard, ReviewLog, Deck, TranslationRecord } from "../types";

const DB_NAME = 'PaperLingoDB';
const DB_VERSION = 8; 
const STORE_FLASHCARDS = 'flashcards';
const STORE_LOGS = 'review_logs';
const STORE_DECKS = 'decks';
const STORE_TRANSLATIONS = 'translations';

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (db.objectStoreNames.contains('papers')) {
          db.deleteObjectStore('papers');
      }

      if (!db.objectStoreNames.contains(STORE_FLASHCARDS)) {
        db.createObjectStore(STORE_FLASHCARDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const logStore = db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DECKS)) {
        db.createObjectStore(STORE_DECKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_TRANSLATIONS)) {
        db.createObjectStore(STORE_TRANSLATIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

// --- TRANSLATIONS ---

export const saveTranslationToDB = async (record: TranslationRecord): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_TRANSLATIONS], 'readwrite');
        const store = tx.objectStore(STORE_TRANSLATIONS);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getTranslationsFromDB = async (): Promise<TranslationRecord[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_TRANSLATIONS], 'readonly');
        const store = tx.objectStore(STORE_TRANSLATIONS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteTranslationFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_TRANSLATIONS], 'readwrite');
        const store = tx.objectStore(STORE_TRANSLATIONS);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

// --- FLASHCARDS ---

export const saveFlashcardToDB = async (card: Flashcard): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_FLASHCARDS], 'readwrite');
        const store = tx.objectStore(STORE_FLASHCARDS);
        store.put(card);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getFlashcardsFromDB = async (): Promise<Flashcard[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_FLASHCARDS], 'readonly');
        const store = tx.objectStore(STORE_FLASHCARDS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteFlashcardFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_FLASHCARDS], 'readwrite');
        const store = tx.objectStore(STORE_FLASHCARDS);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

// --- DECKS ---

export const saveDeckToDB = async (deck: Deck): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_DECKS], 'readwrite');
        const store = tx.objectStore(STORE_DECKS);
        store.put(deck);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getDecksFromDB = async (): Promise<Deck[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_DECKS], 'readonly');
        const store = tx.objectStore(STORE_DECKS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteDeckFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_DECKS], 'readwrite');
        const store = tx.objectStore(STORE_DECKS);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

// --- REVIEW LOGS ---

export const saveReviewLogToDB = async (log: ReviewLog): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_LOGS], 'readwrite');
        const store = tx.objectStore(STORE_LOGS);
        store.add(log);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getReviewLogsFromDB = async (): Promise<ReviewLog[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_LOGS], 'readonly');
        const store = tx.objectStore(STORE_LOGS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const clearAllFlashcardsFromDB = async (): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_FLASHCARDS, STORE_LOGS, STORE_DECKS, STORE_TRANSLATIONS], 'readwrite');
        tx.objectStore(STORE_FLASHCARDS).clear();
        tx.objectStore(STORE_LOGS).clear();
        tx.objectStore(STORE_DECKS).clear();
        tx.objectStore(STORE_TRANSLATIONS).clear();
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};
