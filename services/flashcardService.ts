
import { Flashcard, ReviewRating, ReviewLog, ChartDataPoint, AnkiStats, Deck } from "../types";
import { getFlashcardsFromDB, saveFlashcardToDB, generateId, clearAllFlashcardsFromDB, saveReviewLogToDB, getReviewLogsFromDB, saveDeckToDB, getDecksFromDB, deleteDeckFromDB, deleteFlashcardFromDB } from "./db";
import { fetchCloudFlashcards, saveCloudFlashcard, setFirebaseSyncKey, fetchCloudReviewLogs, saveCloudReviewLog, fetchCloudDecks, saveCloudDeck, deleteCloudDeck, deleteCloudFlashcard } from "./firebaseService";

let hasSynced = false;

const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const LEARNING_STEPS = [1, 10]; 
const GRADUATING_INTERVAL = 1; 
const STARTING_EASE = 2.5;
const MASTERED_INTERVAL = 36500; 

export const setSyncKeyAndSync = async (key: string): Promise<void> => {
    setFirebaseSyncKey(key);
    await clearAllFlashcardsFromDB();
    hasSynced = false;
    await getFlashcards(); 
    await getDecks();
    try {
        const cloudLogs = await fetchCloudReviewLogs();
        if (cloudLogs && cloudLogs.length > 0) {
            for (const log of cloudLogs) {
                await saveReviewLogToDB(log);
            }
        }
    } catch (e) {
        console.warn("Failed to sync review logs", e);
    }
};

export const createDeck = async (name: string, description?: string): Promise<Deck> => {
    const deck: Deck = { id: generateId(), name, description, createdAt: Date.now() };
    await saveDeckToDB(deck);
    saveCloudDeck(deck);
    return deck;
};

export const getDecks = async (): Promise<Deck[]> => {
    try {
        let localDecks = await getDecksFromDB();
        if (localDecks.length === 0 && navigator.onLine) {
            const cloudDecks = await fetchCloudDecks();
            if (cloudDecks.length > 0) {
                for (const deck of cloudDecks) {
                    await saveDeckToDB(deck);
                }
                localDecks = cloudDecks;
            }
        }
        return localDecks;
    } catch (e) {
        return [];
    }
};

export const deleteDeck = async (deckId: string): Promise<void> => {
    await deleteDeckFromDB(deckId);
    deleteCloudDeck(deckId);
    const allCards = await getFlashcards();
    const cardsInDeck = allCards.filter(c => c.deckId === deckId);
    for (const card of cardsInDeck) {
        await deleteFlashcardFromDB(card.id);
        deleteCloudFlashcard(card.id);
    }
};

export const getFlashcards = async (): Promise<Flashcard[]> => {
  try {
    let localCards = await getFlashcardsFromDB();
    if (!hasSynced && navigator.onLine) {
       const cloudCards = await fetchCloudFlashcards();
       if (cloudCards.length > 0) {
           const mergedMap = new Map<string, Flashcard>();
           localCards.forEach(c => mergedMap.set(c.id, c));
           for (const cloudCard of cloudCards) {
               const localCard = mergedMap.get(cloudCard.id);
               if (!localCard) {
                   mergedMap.set(cloudCard.id, cloudCard);
                   await saveFlashcardToDB(cloudCard);
               } else {
                   const localTime = localCard.lastUpdated || 0;
                   const cloudTime = cloudCard.lastUpdated || 0;
                   if (cloudTime > localTime) {
                       mergedMap.set(cloudCard.id, cloudCard);
                       await saveFlashcardToDB(cloudCard);
                   } else if (localTime > cloudTime) {
                       saveCloudFlashcard(localCard);
                   }
               }
           }
           localCards = Array.from(mergedMap.values());
       }
       hasSynced = true;
    }
    return localCards;
  } catch (e) {
    return [];
  }
};

export const saveFlashcard = async (card: Omit<Flashcard, 'id' | 'level' | 'nextReview' | 'createdAt' | 'easeFactor' | 'interval' | 'repetitions'>): Promise<boolean> => {
  const cards = await getFlashcards();
  const normalizedTerm = card.term.trim().toLowerCase();
  
  if (cards.some(c => c.term.trim().toLowerCase() === normalizedTerm && c.deckId === card.deckId)) {
    return false;
  }

  const newCard: Flashcard = {
    ...card,
    term: card.term.trim(),
    id: generateId(),
    level: 0,
    nextReview: Date.now(),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    easeFactor: STARTING_EASE,
    interval: 0,
    repetitions: 0,
    step: 0,
    isForgotten: false
  };

  await saveFlashcardToDB(newCard);
  saveCloudFlashcard(newCard);
  return true;
};

// --- IMPORT & FILTERING LOGIC ---
const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let insideQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (char === '"') {
            if (insideQuotes && nextChar === '"') { currentCell += '"'; i++; }
            else { insideQuotes = !insideQuotes; }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            if (currentCell || currentRow.length > 0) {
                currentRow.push(currentCell.trim());
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            }
        } else { currentCell += char; }
    }
    if (currentCell || currentRow.length > 0) { currentRow.push(currentCell.trim()); rows.push(currentRow); }
    return rows;
};

export const importFlashcardsFromSheet = async (sheetUrl: string, deckId?: string): Promise<{ added: number, total: number, error?: string }> => {
    try {
        const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) return { added: 0, total: 0, error: "Link Google Sheet không hợp lệ." };
        const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
        const response = await fetch(csvUrl);
        if (!response.ok) return { added: 0, total: 0, error: "Không thể truy cập Sheet. Hãy đảm bảo Sheet ở chế độ công khai." };

        const csvText = await response.text();
        const rows = parseCSV(csvText);
        if (rows.length < 2) return { added: 0, total: 0, error: "Sheet không có dữ liệu." };

        const header = rows[0].map(h => h.toLowerCase());
        const idxTerm = header.findIndex(h => h.includes('từ') || h.includes('word') || h.includes('term'));
        const idxMeaning = header.findIndex(h => h.includes('nghĩa') || h.includes('meaning'));
        const idxPhonetic = header.findIndex(h => h.includes('phiên âm') || h.includes('phonetic') || h.includes('ipa'));

        if (idxTerm === -1 || idxMeaning === -1) return { added: 0, total: 0, error: "Thiếu cột 'Từ' hoặc 'Nghĩa'." };

        const allCards = await getFlashcards();
        const existingTerms = new Set(allCards.filter(c => c.deckId === deckId).map(c => c.term.toLowerCase().trim()));

        let addedCount = 0;
        let processedCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const term = (row[idxTerm] || "").trim();
            const meaning = (row[idxMeaning] || "").trim();
            const phonetic = idxPhonetic !== -1 ? (row[idxPhonetic] || "").trim() : "";

            if (term && meaning) {
                processedCount++;
                if (!existingTerms.has(term.toLowerCase())) {
                    const success = await saveFlashcard({ term, meaning, phonetic, explanation: "", deckId });
                    if (success) {
                        addedCount++;
                        existingTerms.add(term.toLowerCase());
                    }
                }
            }
        }
        return { added: addedCount, total: processedCount };
    } catch (e) {
        return { added: 0, total: 0, error: "Lỗi xử lý file." };
    }
};

const STORAGE_KEY_LIMIT = 'paperlingo_daily_limit';
export const getDailyLimit = (): number => {
    const stored = localStorage.getItem(STORAGE_KEY_LIMIT);
    return stored ? parseInt(stored, 10) : 50; 
};
export const setDailyLimit = (limit: number) => {
    localStorage.setItem(STORAGE_KEY_LIMIT, limit.toString());
};

const getStudiedCountToday = async (): Promise<number> => {
    const logs = await getReviewLogsFromDB();
    const todayTs = new Date().setHours(0, 0, 0, 0);
    return logs.filter(l => l.timestamp >= todayTs).length;
};

export const getDueFlashcards = async (deckId?: string): Promise<Flashcard[]> => {
  const cards = await getFlashcards();
  const now = Date.now();
  const limit = getDailyLimit();
  let activeCards = cards.filter(card => card.interval < 10000);
  if (deckId) activeCards = activeCards.filter(c => c.deckId === deckId);
  const allDue = activeCards.filter(card => card.nextReview <= now).sort((a,b) => a.nextReview - b.nextReview);
  const studiedToday = await getStudiedCountToday();
  return allDue.slice(0, Math.max(0, limit - studiedToday));
};

export const getForgottenFlashcards = async (): Promise<Flashcard[]> => {
    const cards = await getFlashcards();
    return cards.filter(c => c.isForgotten === true);
};

export const getAnkiStats = async (deckId?: string): Promise<AnkiStats> => {
    let cards = await getFlashcards();
    let logs = await getReviewLogsFromDB();
    if (deckId) {
        cards = cards.filter(c => c.deckId === deckId);
        const ids = new Set(cards.map(c => c.id));
        logs = logs.filter(l => ids.has(l.cardId));
    }
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const todayLogs = logs.filter(l => l.timestamp >= todayTs);
    return {
        today: { studied: todayLogs.length, limit: getDailyLimit(), againCount: 0, matureCount: 0 },
        counts: { new: cards.filter(c => c.level === 0).length, learning: cards.filter(c => c.level === 1).length, young: 0, mature: cards.filter(c => c.level === 2).length, suspended: 0, total: cards.length },
        due: cards.filter(c => c.nextReview <= Date.now() && c.interval < 10000).length,
        forgotten: cards.filter(c => c.isForgotten).length
    } as any;
};

export const getIntervalPreviewText = (card: Flashcard, rating: ReviewRating): string => {
    const { interval } = calculateNextReview(card, rating, true);
    if (interval >= 10000) return "Xong";
    return interval < 1 ? `${Math.round(interval * 24 * 60)}m` : `${Math.round(interval)}d`;
};

export const calculateNextReview = (card: Flashcard, rating: ReviewRating, isPreview: boolean = false): any => {
    let { interval, easeFactor, repetitions, step = 0 } = card;
    const now = Date.now();
    if (rating === 'easy') return { nextReview: now + (MASTERED_INTERVAL * ONE_DAY), interval: MASTERED_INTERVAL, easeFactor, repetitions: repetitions + 1, step: 0 };
    if (interval < 1) {
        if (rating === 'again') { step = 0; interval = 1 / (24 * 60); }
        else if (rating === 'good') { if (step < 1) { step++; interval = 10 / (24 * 60); } else { step = 0; interval = 1; } }
    } else {
        if (rating === 'again') { interval = 10 / (24 * 60); easeFactor -= 0.2; }
        else if (rating === 'good') { interval *= easeFactor; }
    }
    return { nextReview: now + (interval * ONE_DAY), interval, easeFactor, repetitions: isPreview ? repetitions : repetitions + 1, step };
};

export const updateCardStatus = async (cardId: string, rating: ReviewRating): Promise<void> => {
  const cards = await getFlashcards();
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  const next = calculateNextReview(card, rating);
  const updated: Flashcard = { ...card, ...next, isForgotten: rating === 'again', level: next.interval >= 21 ? 2 : 1, lastUpdated: Date.now() };
  await saveFlashcardToDB(updated);
  saveCloudFlashcard(updated);
  saveCloudReviewLog({ id: generateId(), cardId, rating, timestamp: Date.now() });
};
