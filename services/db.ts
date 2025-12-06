import { ProcessedChunk, SavedPaper, Flashcard } from "../types";

const DB_NAME = 'PaperLingoDB';
const DB_VERSION = 2; // Tăng version để thêm bảng flashcards
const STORE_PAPERS = 'papers';
const STORE_FLASHCARDS = 'flashcards';

// Hàm tạo ID an toàn (thay thế crypto.randomUUID có thể bị lỗi trên http)
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PAPERS)) {
        db.createObjectStore(STORE_PAPERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FLASHCARDS)) {
        db.createObjectStore(STORE_FLASHCARDS, { keyPath: 'id' });
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

// --- PAPERS ---

export const savePaperToDB = async (paper: SavedPaper): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PAPERS], 'readwrite');
    const store = transaction.objectStore(STORE_PAPERS);
    const request = store.put(paper);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllPapersFromDB = async (): Promise<SavedPaper[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PAPERS], 'readonly');
    const store = transaction.objectStore(STORE_PAPERS);
    const request = store.getAll();

    request.onsuccess = () => {
        const papers = request.result as SavedPaper[];
        papers.sort((a, b) => b.lastOpened - a.lastOpened);
        resolve(papers);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getPaperFromDB = async (id: string): Promise<SavedPaper | undefined> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_PAPERS], 'readonly');
      const store = transaction.objectStore(STORE_PAPERS);
      const request = store.get(id);
  
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
};

export const deletePaperFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_PAPERS], 'readwrite');
      const store = transaction.objectStore(STORE_PAPERS);
      const request = store.delete(id);
  
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
};

export const updatePaperProgress = async (id: string, chunks: ProcessedChunk[], currentChunkIndex: number): Promise<void> => {
    const paper = await getPaperFromDB(id);
    if (paper) {
        paper.processedChunks = chunks;
        paper.currentChunkIndex = currentChunkIndex;
        paper.lastOpened = Date.now();
        await savePaperToDB(paper);
    }
};

// --- FLASHCARDS ---

export const saveFlashcardToDB = async (card: Flashcard): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_FLASHCARDS], 'readwrite');
        const store = tx.objectStore(STORE_FLASHCARDS);
        const request = store.put(card);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
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

export const updateFlashcardInDB = async (card: Flashcard): Promise<void> => {
    return saveFlashcardToDB(card);
};