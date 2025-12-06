

import { Flashcard, ReviewRating, ReviewLog, ChartDataPoint, AnkiStats } from "../types";
import { getFlashcardsFromDB, saveFlashcardToDB, generateId, clearAllFlashcardsFromDB, saveReviewLogToDB, getReviewLogsFromDB } from "./db";
import { fetchCloudFlashcards, saveCloudFlashcard, setFirebaseSyncKey } from "./firebaseService";

let hasSynced = false;

// --- UTILS ---
const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

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
    await getFlashcards(); // Tự động tải từ Cloud về sau khi đã dọn sạch
};

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
  
  if (cards.some(c => c.term.toLowerCase() === card.term.toLowerCase())) {
    return false; 
  }

  const newCard: Flashcard = {
    ...card,
    id: generateId(),
    level: 0, // 0 = New
    nextReview: Date.now(),
    createdAt: Date.now(),
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0
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

export const importFlashcardsFromSheet = async (sheetUrl: string): Promise<{ added: number, total: number, error?: string }> => {
    try {
        // 1. Extract Spreadsheet ID
        // Regex supports: /d/ID/edit, /d/ID/copy, etc.
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
        // Expected: Từ | Pinyin | Từ Loại | Nghĩa của từ
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
            
            // Nếu cột Từ Loại có dữ liệu, thêm vào phần giải thích
            const explanation = type ? `(${type})` : "";

            if (term && meaning) {
                processedCount++;
                const success = await saveFlashcard({
                    term,
                    meaning,
                    phonetic,
                    explanation
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
    return stored ? parseInt(stored, 10) : 50; // Default 50
};

export const setDailyLimit = (limit: number) => {
    localStorage.setItem(STORAGE_KEY_LIMIT, limit.toString());
};

// Đếm số thẻ đã học hôm nay
const getStudiedCountToday = async (): Promise<number> => {
    const logs = await getReviewLogsFromDB();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTs = startOfDay.getTime();
    
    return logs.filter(l => l.timestamp >= todayTs).length;
};

// Logic: Chỉ lấy thẻ Due, nhưng lọc theo Daily Limit
export const getDueFlashcards = async (): Promise<Flashcard[]> => {
  const cards = await getFlashcards();
  const now = Date.now();
  const limit = getDailyLimit();
  
  // Lấy tất cả thẻ đến hạn
  const allDue = cards.filter(card => card.nextReview <= now).sort((a,b) => a.nextReview - b.nextReview);
  
  // Kiểm tra limit hôm nay
  const studiedToday = await getStudiedCountToday();
  const remainingQuota = Math.max(0, limit - studiedToday);
  
  // Trả về số thẻ tối đa cho phép
  return allDue.slice(0, remainingQuota);
};

export const getFlashcardStats = async (): Promise<FlashcardStats> => {
    const cards = await getFlashcards();
    const now = Date.now();
    const limit = getDailyLimit();
    
    const allDue = cards.filter(c => c.nextReview <= now);
    const studiedToday = await getStudiedCountToday();
    
    // Remaining quota for today
    const remainingQuota = Math.max(0, limit - studiedToday);
    
    const backlog = Math.max(0, allDue.length - remainingQuota);

    return {
        total: cards.length,
        due: allDue.length, 
        new: cards.filter(c => c.repetitions === 0).length,
        learning: cards.filter(c => c.repetitions > 0 && c.interval < 21).length, 
        review: cards.filter(c => c.interval >= 21).length,
        mastered: cards.filter(c => c.interval > 90).length,
        
        studiedToday,
        dailyLimit: limit,
        backlog
    };
};

// --- ANKI STATS GENERATOR ---
export const getAnkiStats = async (): Promise<AnkiStats> => {
    const cards = await getFlashcards();
    const logs = await getReviewLogsFromDB();
    const now = Date.now();
    
    // 1. TODAY
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTs = startOfDay.getTime();
    const todayLogs = logs.filter(l => l.timestamp >= todayTs);
    
    const todayStats = {
        studied: todayLogs.length,
        limit: getDailyLimit(),
        againCount: todayLogs.filter(l => l.rating === 'again').length,
        matureCount: todayLogs.filter(l => l.rating !== 'again').length
    };

    // 2. COUNTS (Pie Chart)
    // Classification: New (0 reps), Young (< 21d interval), Mature (>= 21d interval)
    // We can also split Young into "Learning" (reps > 0 but low)
    const counts = {
        new: 0,
        learning: 0,
        young: 0,
        mature: 0,
        suspended: 0,
        total: cards.length
    };

    cards.forEach(c => {
        if (c.repetitions === 0) {
            counts.new++;
        } else if (c.interval < 1) {
            counts.learning++;
        } else if (c.interval < 21) {
            counts.young++;
        } else {
            counts.mature++;
        }
    });

    // 3. FORECAST (Future Due Dates) - 30 days
    const forecastMap = new Array(31).fill(0);
    const forecastLabels = new Array(31).fill('').map((_, i) => i === 0 ? 'Today' : `+${i}d`);
    
    cards.forEach(c => {
        if (c.nextReview > now) {
            const diffTime = Math.abs(c.nextReview - now);
            const diffDays = Math.ceil(diffTime / ONE_DAY);
            if (diffDays <= 30) {
                forecastMap[diffDays]++;
            }
        } else {
             // Overdue counts as today/tomorrow load essentially
             forecastMap[0]++;
        }
    });

    // 4. INTERVALS (Distribution)
    // Buckets: 0-1d, 2-7d, 8-30d, 1-3m, 3-6m, 6m-1y, 1y+
    const intervalBuckets = [0, 0, 0, 0, 0, 0, 0];
    const intervalLabels = ['0-1d', '2-7d', '8-30d', '1-3m', '3-6m', '6m-1y', '>1y'];
    
    cards.forEach(c => {
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
        forecast: { data: forecastMap, labels: forecastLabels },
        intervals: { data: intervalBuckets, labels: intervalLabels }
    };
};

// --- SM-2 ALGORITHM ---
export const calculateNextReview = (card: Flashcard, rating: ReviewRating): { nextReview: number, interval: number, easeFactor: number, repetitions: number } => {
    let { interval, easeFactor, repetitions } = card;
    const now = Date.now();

    if (rating === 'again') {
        repetitions = 0;
        interval = 0; 
        return { 
            nextReview: now + ONE_MINUTE, 
            interval: 0, 
            easeFactor: Math.max(1.3, easeFactor - 0.2), 
            repetitions: 0 
        };
    }

    if (interval === 0) {
        interval = 1; 
    } else if (interval === 1) {
        interval = 6; 
    } else {
        interval = Math.round(interval * easeFactor);
    }

    if (rating === 'hard') {
        interval = Math.max(1, Math.round(interval * 0.5));
        easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else if (rating === 'easy') {
        interval = Math.round(interval * 1.3); 
        easeFactor += 0.15;
    }

    repetitions++;

    return {
        nextReview: now + (interval * ONE_DAY),
        interval,
        easeFactor,
        repetitions
    };
};

export const updateCardStatus = async (cardId: string, rating: ReviewRating): Promise<void> => {
  const cards = await getFlashcards();
  const index = cards.findIndex(c => c.id === cardId);
  if (index === -1) return;

  const card = cards[index];
  const { nextReview, interval, easeFactor, repetitions } = calculateNextReview(card, rating);

  const updatedCard: Flashcard = { 
      ...card, 
      nextReview, 
      interval, 
      easeFactor, 
      repetitions,
      level: interval > 21 ? 2 : 1 
  };
  
  await saveFlashcardToDB(updatedCard);
  saveCloudFlashcard(updatedCard);
  
  // GHI LOG LỊCH SỬ
  await saveReviewLogToDB({
      id: generateId(),
      cardId,
      rating,
      timestamp: Date.now()
  });
};
