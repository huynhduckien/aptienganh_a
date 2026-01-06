import { Flashcard, ReviewRating, ReviewLog, ChartDataPoint, AnkiStats, Deck } from "../types";
import { getFlashcardsFromDB, saveFlashcardToDB, generateId, clearAllFlashcardsFromDB, saveReviewLogToDB, getReviewLogsFromDB, saveDeckToDB, getDecksFromDB, deleteDeckFromDB, deleteFlashcardFromDB } from "./db";
import { fetchCloudFlashcards, saveCloudFlashcard, setFirebaseSyncKey, fetchCloudReviewLogs, saveCloudReviewLog, fetchCloudDecks, saveCloudDeck, deleteCloudDeck, deleteCloudFlashcard } from "./firebaseService";

let hasSynced = false;

// --- UTILS ---
const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

// ANKI CONSTANTS
const LEARNING_STEPS = [1, 10]; // Minutes
const GRADUATING_INTERVAL = 1; // Day
const STARTING_EASE = 2.5;
const MASTERED_INTERVAL = 36500; // 100 years (For 'Easy' skip)

export interface FlashcardStats {
    total: number;
    due: number;
    new: number;
    learning: number;
    review: number;
    mastered: number;
    
    // Daily Limit Info
    studiedToday: number;
    dailyLimit: number;
    backlog: number; // Nợ bài (số bài due nhưng bị ẩn do giới hạn ngày)
}

// --- SYNC LOGIC ---

export const setSyncKeyAndSync = async (key: string): Promise<void> => {
    setFirebaseSyncKey(key);
    
    // QUAN TRỌNG: Khi đăng nhập tài khoản mới, xóa sạch dữ liệu cũ trên máy
    await clearAllFlashcardsFromDB();
    
    hasSynced = false;

    // 1. Tải Flashcards và Đồng bộ thông minh (Last Write Wins)
    await getFlashcards(); 

    // 2. Tải Decks
    await getDecks();

    // 3. Tải Review Logs (Lịch sử học)
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

// --- DECKS MANAGEMENT ---

export const createDeck = async (name: string, description?: string): Promise<Deck> => {
    const deck: Deck = {
        id: generateId(),
        name,
        description,
        createdAt: Date.now()
    };
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
        console.warn("Failed to load decks", e);
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

export const getCardsByDeck = async (deckId: string): Promise<Flashcard[]> => {
    const cards = await getFlashcards();
    return cards.filter(c => c.deckId === deckId);
};

// --- FLASHCARDS ---

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
    console.warn("Failed to load flashcards", e);
    return [];
  }
};

export const saveFlashcard = async (card: Omit<Flashcard, 'id' | 'level' | 'nextReview' | 'createdAt' | 'easeFactor' | 'interval' | 'repetitions'>): Promise<boolean> => {
  const cards = await getFlashcards();
  
  // Chuẩn hóa triệt để để so sánh
  const trimmedTerm = card.term.trim();
  const normalizedTerm = trimmedTerm.toLowerCase();
  
  // Kiểm tra trùng lặp trong cùng một bộ thẻ (deckId)
  if (cards.some(c => (c.term || "").trim().toLowerCase() === normalizedTerm && c.deckId === card.deckId)) {
    return false;
  }

  const newCard: Flashcard = {
    ...card,
    term: trimmedTerm, 
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

// --- IMPORT GOOGLE SHEET LOGIC ---

const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
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
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }
    return rows;
};

export const importFlashcardsFromSheet = async (sheetUrl: string, deckId?: string): Promise<{ added: number, total: number, error?: string }> => {
    try {
        const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match || !match[1]) {
            return { added: 0, total: 0, error: "Link Google Sheet không hợp lệ." };
        }
        const spreadsheetId = match[1];

        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
        const response = await fetch(csvUrl);
        
        if (!response.ok) {
            return { added: 0, total: 0, error: "Không thể đọc dữ liệu. Hãy chắc chắn bạn đã CHIA SẺ file ở chế độ 'Bất kỳ ai có đường liên kết'." };
        }

        const csvText = await response.text();
        const rows = parseCSV(csvText);

        if (rows.length < 2) {
             return { added: 0, total: 0, error: "File không có dữ liệu hoặc sai định dạng." };
        }

        const header = rows[0].map(h => h.toLowerCase());
        
        const idxTerm = header.findIndex(h => h.includes('từ') && !h.includes('nghĩa') && !h.includes('loại'));
        const idxPhonetic = header.findIndex(h => h.includes('pinyin') || h.includes('phiên âm') || h.includes('ipa'));
        const idxType = header.findIndex(h => h.includes('từ loại') || h.includes('pos') || h.includes('part of'));
        const idxMeaning = header.findIndex(h => h.includes('nghĩa') || h.includes('meaning'));

        if (idxTerm === -1 || idxMeaning === -1) {
             return { added: 0, total: 0, error: "Không tìm thấy cột 'Từ' hoặc 'Nghĩa của từ'. Vui lòng kiểm tra lại tiêu đề cột." };
        }

        // Tối ưu hóa: Lấy danh sách từ hiện có một lần duy nhất
        const allCards = await getFlashcards();
        const existingTerms = new Set(
            allCards
                .filter(c => c.deckId === deckId)
                .map(c => (c.term || "").trim().toLowerCase())
        );

        let addedCount = 0;
        let processedCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length <= idxTerm) continue;

            const rawTerm = row[idxTerm] || "";
            const meaning = row[idxMeaning] || "";
            const phonetic = idxPhonetic !== -1 ? (row[idxPhonetic] || "") : "";
            const type = idxType !== -1 ? (row[idxType] || "") : "";
            
            const explanation = type ? `(${type})` : "";
            const term = rawTerm.trim();

            if (term && meaning) {
                processedCount++;
                const normalizedTerm = term.toLowerCase();

                // Kiểm tra trùng lặp dựa trên Set đã chuẩn bị
                if (existingTerms.has(normalizedTerm)) {
                    continue; 
                }

                // Gọi saveFlashcard với dữ liệu đã được chuẩn hóa
                const success = await saveFlashcard({
                    term,
                    meaning,
                    phonetic,
                    explanation,
                    deckId
                });
                
                if (success) {
                    addedCount++;
                    existingTerms.add(normalizedTerm); // Cập nhật Set để tránh trùng lặp trong cùng một file sheet
                }
            }
        }

        return { added: addedCount, total: processedCount };

    } catch (e) {
        console.error("Import failed", e);
        return { added: 0, total: 0, error: "Lỗi không xác định khi import." };
    }
};

// --- DAILY LIMIT & SETTINGS ---

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
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTs = startOfDay.getTime();
    
    return logs.filter(l => l.timestamp >= todayTs).length;
};

export const getDueFlashcards = async (deckId?: string): Promise<Flashcard[]> => {
  const cards = await getFlashcards();
  const now = Date.now();
  const limit = getDailyLimit();
  
  let activeCards = cards.filter(card => card.interval < 10000);
  if (deckId) {
      activeCards = activeCards.filter(c => c.deckId === deckId);
  }

  const allDue = activeCards.filter(card => card.nextReview <= now).sort((a,b) => {
      const aIsLearning = a.interval < 1;
      const bIsLearning = b.interval < 1;
      if (aIsLearning && !bIsLearning) return -1;
      if (!aIsLearning && bIsLearning) return 1;
      return a.nextReview - b.nextReview;
  });
  
  const studiedToday = await getStudiedCountToday();
  const remainingQuota = Math.max(0, limit - studiedToday);
  
  return allDue.slice(0, remainingQuota);
};

export const getForgottenFlashcards = async (deckId?: string): Promise<Flashcard[]> => {
    const cards = await getFlashcards();
    let forgotten = cards.filter(c => c.isForgotten === true);
    if (deckId) {
        forgotten = forgotten.filter(c => c.deckId === deckId);
    }
    return forgotten;
};

export const getAnkiStats = async (deckId?: string): Promise<AnkiStats> => {
    let cards = await getFlashcards();
    let logs = await getReviewLogsFromDB();
    const now = Date.now();

    if (deckId) {
        cards = cards.filter(c => c.deckId === deckId);
        const cardIds = new Set(cards.map(c => c.id));
        logs = logs.filter(l => cardIds.has(l.cardId));
    }
    
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTs = startOfDay.getTime();
    const todayLogs = logs.filter(l => l.timestamp >= todayTs);
    
    const rawDueCount = cards.filter(c => c.interval < 10000 && c.nextReview <= now).length;
    const forgottenCount = cards.filter(c => c.isForgotten === true).length;

    const todayStats = {
        studied: todayLogs.length,
        limit: getDailyLimit(),
        againCount: todayLogs.filter(l => l.rating === 'again').length,
        matureCount: todayLogs.filter(l => l.rating !== 'again').length
    };

    const counts = {
        new: 0,
        learning: 0,
        young: 0,
        mature: 0,
        suspended: 0,
        total: cards.length
    };

    cards.forEach(c => {
        if (c.interval >= 10000) {
            counts.mature++;
        } else if (c.interval === 0 && c.repetitions === 0) {
            counts.new++;
        } else if (c.interval < 1) { 
            counts.learning++;
        } else if (c.interval < 21) {
            counts.young++;
        } else {
            counts.mature++;
        }
    });

    const FORECAST_DAYS = 365;
    const forecastYoung = new Array(FORECAST_DAYS).fill(0);
    const forecastMature = new Array(FORECAST_DAYS).fill(0);
    const forecastLabels = new Array(FORECAST_DAYS).fill('').map((_, i) => i === 0 ? 'Today' : `+${i}d`);
    let maxForecast = 0;
    
    cards.forEach(c => {
        if (c.interval >= 10000) return;
        let diffDays = 0;
        if (c.nextReview <= now) {
            diffDays = 0;
        } else {
            const diffTime = c.nextReview - now;
            diffDays = Math.ceil(diffTime / ONE_DAY);
        }
        if (diffDays < FORECAST_DAYS && diffDays >= 0) {
            if (c.interval >= 21) forecastMature[diffDays]++;
            else forecastYoung[diffDays]++;
        }
    });

    for(let i=0; i<FORECAST_DAYS; i++) {
        const total = forecastYoung[i] + forecastMature[i];
        if (total > maxForecast) maxForecast = total;
    }

    const intervalBuckets = [0, 0, 0, 0, 0, 0, 0];
    const intervalLabels = ['0-1d', '2-7d', '8-30d', '1-3m', '3-6m', '6m-1y', '>1y'];
    cards.forEach(c => {
        if (c.interval >= 10000) return;
        const days = c.interval;
        if (days <= 1) intervalBuckets[0]++;
        else if (days <= 7) intervalBuckets[1]++;
        else if (days <= 30) intervalBuckets[2]++;
        else if (days <= 90) intervalBuckets[3]++;
        else if (days <= 180) intervalBuckets[4]++;
        else if (days <= 365) intervalBuckets[5]++;
        else intervalBuckets[6]++;
    });

    return {
        today: todayStats,
        counts,
        forecast: { 
            young: forecastYoung, 
            mature: forecastMature, 
            labels: forecastLabels,
            maxTotal: maxForecast 
        },
        intervals: { data: intervalBuckets, labels: intervalLabels },
        due: rawDueCount,
        forgotten: forgottenCount
    } as any;
};

export const getIntervalPreviewText = (card: Flashcard, rating: ReviewRating): string => {
    const { interval } = calculateNextReview(card, rating, true);
    if (interval >= 10000) return "Xong";
    if (interval < 1) {
        const mins = Math.round(interval * 24 * 60);
        return mins < 1 ? "< 1m" : `${mins}m`;
    } else {
        const days = Math.round(interval);
        if (days >= 365) return `${(days/365).toFixed(1)}y`;
        return `${days}d`;
    }
};

export const calculateNextReview = (
    card: Flashcard, 
    rating: ReviewRating, 
    isPreview: boolean = false
): { nextReview: number, interval: number, easeFactor: number, repetitions: number, step: number } => {
    let { interval, easeFactor, repetitions, step = 0 } = card;
    const now = Date.now();
    if (rating === 'easy') {
        return {
            nextReview: now + (MASTERED_INTERVAL * ONE_DAY),
            interval: MASTERED_INTERVAL,
            easeFactor,
            repetitions: repetitions + 1,
            step: 0
        };
    }
    const isLearning = interval < 1;
    if (isLearning) {
        if (rating === 'again') {
            step = 0;
            interval = LEARNING_STEPS[0] / (24 * 60);
        } else if (rating === 'hard') {
            interval = 6 / (24 * 60);
        } else if (rating === 'good') {
            if (step < LEARNING_STEPS.length - 1) {
                step++;
                interval = LEARNING_STEPS[step] / (24 * 60);
            } else {
                step = 0;
                interval = GRADUATING_INTERVAL;
            }
        }
    } else {
        if (rating === 'again') {
            step = 0;
            interval = LEARNING_STEPS[1] / (24 * 60);
            easeFactor = Math.max(1.3, easeFactor - 0.2);
            repetitions = 0;
        } else if (rating === 'hard') {
            interval = interval * 1.2;
            easeFactor = Math.max(1.3, easeFactor - 0.15);
        } else if (rating === 'good') {
            interval = interval * easeFactor;
        }
    }
    if (!isPreview && rating !== 'again') {
        repetitions++;
    }
    return {
        nextReview: now + (interval * ONE_DAY),
        interval,
        easeFactor,
        repetitions,
        step
    };
};

export const updateCardStatus = async (cardId: string, rating: ReviewRating): Promise<void> => {
  const cards = await getFlashcards();
  const index = cards.findIndex(c => c.id === cardId);
  if (index === -1) return;

  const card = cards[index];
  const { nextReview, interval, easeFactor, repetitions, step } = calculateNextReview(card, rating);

  let isForgotten = card.isForgotten || false;
  if (rating === 'again') {
      isForgotten = true;
  } else if (rating === 'good' || rating === 'easy') {
      isForgotten = false;
  }

  const updatedCard: Flashcard = { 
      ...card, 
      nextReview, 
      interval, 
      easeFactor, 
      repetitions, 
      step,
      isForgotten,
      level: interval >= 21 ? 2 : 1,
      lastUpdated: Date.now()
  };
  
  await saveFlashcardToDB(updatedCard);
  saveCloudFlashcard(updatedCard);
  
  const log: ReviewLog = {
      id: generateId(),
      cardId,
      rating,
      timestamp: Date.now()
  };

  await saveReviewLogToDB(log);
  saveCloudReviewLog(log);
};