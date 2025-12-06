
import { ProcessedChunk, SavedPaper } from "../types";

const DB_NAME = 'PaperLingoDB';
const DB_VERSION = 1;
const STORE_NAME = 'papers';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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

export const savePaperToDB = async (paper: SavedPaper): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(paper);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllPapersFromDB = async (): Promise<SavedPaper[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        // Sort by last opened descending
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
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
  
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
};

export const deletePaperFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
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
}
