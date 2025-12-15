import { Flashcard, ReviewRating, ReviewLog, ChartDataPoint, AnkiStats, Deck } from "../types";
import { getFlashcardsFromDB, saveFlashcardToDB, generateId, clearAllFlashcardsFromDB, saveReviewLogToDB, getReviewLogsFromDB, saveDeckToDB, getDecksFromDB, deleteDeckFromDB, deleteFlashcardFromDB } from "./db";
import { fetchCloudFlashcards, saveCloudFlashcard, setFirebaseSyncKey, fetchCloudReviewLogs, saveCloudReviewLog, fetchCloudDecks, saveCloudDeck, deleteCloudDeck } from "./firebaseService";

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

    // 1. Tải Flashcards
    await getFlashcards(); 

    // 2. Tải Decks
    try {
        const cloudDecks = await fetchCloudDecks();
        for (const deck of cloudDecks) {
            await saveDeckToDB(deck);
        }
    } catch(e) { console.warn("Sync Decks Error", e); }

    // 3. Tải Review Logs (Lịch sử học) để vẽ biểu đồ
    try {
        const cloudLogs = await fetchCloudReviewLogs();
        if (cloudLogs && cloudLogs.length > 0) {
            // Lưu logs vào DB local để các hàm thống kê hoạt động
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
    // Sync logic handled in setSyncKeyAndSync mostly, but can add detailed sync here if needed
    // For now, trust DB first
    return await getDecksFromDB();
};

export const deleteDeck = async (deckId: string): Promise<void> => {
    // 1. Delete Deck Metadata
    await deleteDeckFromDB(deckId);
    deleteCloudDeck(deckId);

    // 2. Delete All Cards in Deck
    const allCards = await getFlashcards();
    const cardsInDeck = allCards.filter(c => c.deckId === deckId);
    
    for (const card of cardsInDeck) {
        // Technically we could soft delete or move to "Uncategorized"
        // But strict deletion is safer for now
        await deleteFlashcardFromDB(card.id);
        // We probably need a deleteCloudFlashcard method, but let's leave it for now (cards become orphaned in cloud)
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

    // Sync logic
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
                   const localProgress = (localCard.repetitions || 0) + (localCard.interval || 0);
                   const cloudProgress = (cloudCard.repetitions || 0) + (cloudCard.interval || 0);
                   
                   if (cloudProgress > localProgress) {
                       mergedMap.set(cloudCard.id, cloudCard);
                       await saveFlashcardToDB(cloudCard);
                   } else if (localProgress > cloudProgress) {
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
  
  if (cards.some(c => c.term.toLowerCase() === card.term.toLowerCase() && c.deckId === card.deckId)) {
    return false; // Prevent duplicates in SAME deck (or global if deck undefined)
  }

  const newCard: Flashcard = {
    ...card,
    id: generateId(),
    level: 0, // 0 = New
    nextReview: Date.now(),
    createdAt: Date.now(),
    easeFactor: STARTING_EASE,
    interval: 0,
    repetitions: 0,
    step: 0
  };

  await saveFlashcardToDB(newCard);
  saveCloudFlashcard(newCard);

  return true;
};

// --- IMPORT GOOGLE SHEET LOGIC ---

// Helper để parse CSV (xử lý cả dấu phẩy trong ngoặc kép)
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
                currentCell += '"'; // Escape double quotes
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
        // 1. Extract Spreadsheet ID
        const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match || !match[1]) {
            return { added: 0, total: 0, error: "Link Google Sheet không hợp lệ." };
        }
        const spreadsheetId = match[1];

        // 2. Fetch CSV Data
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

        // 3. Map Columns
        const header = rows[0].map(h => h.toLowerCase());
        
        const idxTerm = header.findIndex(h => h.includes('từ') && !h.includes('nghĩa') && !h.includes('loại'));
        const idxPhonetic = header.findIndex(h => h.includes('pinyin') || h.includes('phiên âm') || h.includes('ipa'));
        const idxType = header.findIndex(h => h.includes('từ loại') || h.includes('pos') || h.includes('part of'));
        const idxMeaning = header.findIndex(h => h.includes('nghĩa') || h.includes('meaning'));

        if (idxTerm === -1 || idxMeaning === -1) {
             return { added: 0, total: 0, error: "Không tìm thấy cột 'Từ' hoặc 'Nghĩa của từ'. Vui lòng kiểm tra lại tiêu đề cột." };
        }

        let addedCount = 0;
        let processedCount = 0;

        // 4. Process Rows
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length <= idxTerm) continue;

            const term = row[idxTerm];
            const meaning = row[idxMeaning] || "";
            const phonetic = idxPhonetic !== -1 ? row[idxPhonetic] : "";
            const type = idxType !== -1 ? row[idxType] : "";
            
            const explanation = type ? `(${type})` : "";

            if (term && meaning) {
                processedCount++;
                const success = await saveFlashcard({
                    term,
                    meaning,
                    phonetic,
                    explanation,
                    deckId // Pass deckId
                });
                if (success) addedCount++;
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

// UPDATED: Supports filtering by deckId
export const getDueFlashcards = async (deckId?: string): Promise<Flashcard[]> => {
  const cards = await getFlashcards();
  const now = Date.now();
  const limit = getDailyLimit();
  
  // Filter by Deck if provided
  let activeCards = cards.filter(card => card.interval < 10000);
  if (deckId) {
      activeCards = activeCards.filter(c => c.deckId === deckId);
  }

  // FIX: Sắp xếp ưu tiên thẻ Learning/Again lên đầu để không bị mất khi cắt giới hạn
  const allDue = activeCards.filter(card => card.nextReview <= now).sort((a,b) => {
      // 1. Ưu tiên thẻ đang học dở (interval < 1 ngày) hoặc thẻ Again
      const aIsLearning = a.interval < 1;
      const bIsLearning = b.interval < 1;
      
      if (aIsLearning && !bIsLearning) return -1; // a lên đầu
      if (!aIsLearning && bIsLearning) return 1;  // b lên đầu
      
      // 2. Nếu cùng loại thì sắp xếp theo thời gian hết hạn (cũ nhất lên trước)
      return a.nextReview - b.nextReview;
  });
  
  // Global Limit applies globally. If reviewing specific deck, we might want to relax this?
  // For now, let's keep daily limit global.
  const studiedToday = await getStudiedCountToday();
  const remainingQuota = Math.max(0, limit - studiedToday);
  
  return allDue.slice(0, remainingQuota);
};

export const getForgottenCardsToday = async (): Promise<Flashcard[]> => {
    const logs = await getReviewLogsFromDB();
    const cards = await getFlashcards();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTs = startOfDay.getTime();
    
    // Get IDs of cards marked 'again' today
    const forgottenIds = new Set(
        logs.filter(l => l.timestamp >= todayTs && l.rating === 'again')
            .map(l => l.cardId)
    );

    return cards.filter(c => forgottenIds.has(c.id));
};

// --- ANKI STATS GENERATOR (Supports Deck Filtering) ---
export const getAnkiStats = async (deckId?: string): Promise<AnkiStats> => {
    let cards = await getFlashcards();
    let logs = await getReviewLogsFromDB();
    const now = Date.now();

    // Filter by Deck
    if (deckId) {
        cards = cards.filter(c => c.deckId === deckId);
        // Optimization: Filter logs by card IDs in this deck
        const cardIds = new Set(cards.map(c => c.id));
        logs = logs.filter(l => cardIds.has(l.cardId));
    }
    
    // 1. TODAY
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTs = startOfDay.getTime();
    const todayLogs = logs.filter(l => l.timestamp >= todayTs);
    
    // Calculate due count for display purposes in stats (without limit trimming)
    const rawDueCount = cards.filter(c => c.interval < 10000 && c.nextReview <= now).length;

    const todayStats = {
        studied: todayLogs.length,
        limit: getDailyLimit(),
        againCount: todayLogs.filter(l => l.rating === 'again').length,
        matureCount: todayLogs.filter(l => l.rating !== 'again').length
    };

    // 2. COUNTS (Pie Chart)
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
            counts.mature++; // Mastered count as mature/done
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

    // 3. FORECAST (Future Due Dates) - 365 days
    const FORECAST_DAYS = 365;
    const forecastYoung = new Array(FORECAST_DAYS).fill(0);
    const forecastMature = new Array(FORECAST_DAYS).fill(0);
    const forecastLabels = new Array(FORECAST_DAYS).fill('').map((_, i) => i === 0 ? 'Today' : `+${i}d`);
    let maxForecast = 0;
    
    cards.forEach(c => {
        if (c.interval >= 10000) return; // Skip mastered

        let diffDays = 0;
        if (c.nextReview <= now) {
            // Overdue cards go to "Today" (Day 0) to represent backlog
            diffDays = 0;
        } else {
            const diffTime = c.nextReview - now;
            diffDays = Math.ceil(diffTime / ONE_DAY);
        }

        if (diffDays < FORECAST_DAYS && diffDays >= 0) {
            // Anki Definition: Mature = Interval >= 21 days
            if (c.interval >= 21) {
                forecastMature[diffDays]++;
            } else {
                forecastYoung[diffDays]++;
            }
        }
    });

    // Calculate max for global scale (optional)
    for(let i=0; i<FORECAST_DAYS; i++) {
        const total = forecastYoung[i] + forecastMature[i];
        if (total > maxForecast) maxForecast = total;
    }

    // 4. INTERVALS
    const intervalBuckets = [0, 0, 0, 0, 0, 0, 0];
    const intervalLabels = ['0-1d', '2-7d', '8-30d', '1-3m', '3-6m', '6m-1y', '>1y'];
    
    cards.forEach(c => {
        if (c.interval >= 10000) return; // Don't chart mastered cards in intervals
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
        due: rawDueCount // Add due property to return type logic
    } as any;
};

// --- PREVIEW HELPER ---

export const getIntervalPreviewText = (card: Flashcard, rating: ReviewRating): string => {
    // We calculate a simulation
    const { interval } = calculateNextReview(card, rating, true);
    
    if (interval >= 10000) return "Xong"; // "Done" or "Mastered"

    if (interval < 1) {
        // Minutes
        const mins = Math.round(interval * 24 * 60);
        return mins < 1 ? "< 1m" : `${mins}m`;
    } else {
        // Days
        const days = Math.round(interval);
        if (days >= 365) return `${(days/365).toFixed(1)}y`;
        return `${days}d`;
    }
};

// --- CORE SRS ALGORITHM (Modified SM-2) ---

export const calculateNextReview = (
    card: Flashcard, 
    rating: ReviewRating, 
    isPreview: boolean = false
): { nextReview: number, interval: number, easeFactor: number, repetitions: number, step: number } => {
    
    let { interval, easeFactor, repetitions, step = 0 } = card;
    const now = Date.now();

    // 1. EASY: SKIP FOREVER (Mastered)
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
        // --- LEARNING PHASE ---
        // Steps: 1m (0), 10m (1) -> Graduate to 1 Day
        
        if (rating === 'again') {
            // Reset to Step 1 (1m)
            step = 0;
            interval = LEARNING_STEPS[0] / (24 * 60); // 1 minute
        } else if (rating === 'hard') {
            // Repeat current step or use roughly 6 mins avg
            interval = 6 / (24 * 60); // 6 mins
            // Do not advance step
        } else if (rating === 'good') {
            if (step < LEARNING_STEPS.length - 1) {
                // Advance Step (1m -> 10m)
                step++;
                interval = LEARNING_STEPS[step] / (24 * 60);
            } else {
                // Graduate to Review Phase (1 Day)
                step = 0;
                interval = GRADUATING_INTERVAL;
            }
        }

    } else {
        // --- REVIEW PHASE ---
        // Card is already graduated (>= 1 day)
        
        if (rating === 'again') {
            // Lapse: Forgot the card. Back to Re-learning (10m step)
            step = 0;
            interval = LEARNING_STEPS[1] / (24 * 60); // 10 mins
            easeFactor = Math.max(1.3, easeFactor - 0.2); // Penalty
            repetitions = 0;
        } else if (rating === 'hard') {
            // Tough but remembered. Slow growth.
            interval = interval * 1.2;
            easeFactor = Math.max(1.3, easeFactor - 0.15); // Slight penalty
        } else if (rating === 'good') {
            // Standard growth
            interval = interval * easeFactor;
            // No ease change usually on good
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

  const updatedCard: Flashcard = { 
      ...card, 
      nextReview, 
      interval, 
      easeFactor, 
      repetitions, 
      step,
      level: interval >= 21 ? 2 : 1 
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