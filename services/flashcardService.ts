

import { Flashcard, ReviewRating, ReviewLog, ChartDataPoint } from "../types";
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
    
    // Backlog: Số lượng thẻ Due thực tế - Số lượng thẻ được phép học hôm nay
    // Nếu Backlog > 0 nghĩa là kể cả học hết hôm nay vẫn còn nợ sang hôm sau
    const backlog = Math.max(0, allDue.length - remainingQuota);

    return {
        total: cards.length,
        due: allDue.length, // Total real due
        new: cards.filter(c => c.repetitions === 0).length,
        learning: cards.filter(c => c.repetitions > 0 && c.interval < 21).length, 
        review: cards.filter(c => c.interval >= 21).length,
        mastered: cards.filter(c => c.interval > 90).length,
        
        studiedToday,
        dailyLimit: limit,
        backlog
    };
};

export const getStudyHistoryChart = async (range: 'week' | 'month' | 'year'): Promise<ChartDataPoint[]> => {
    const logs = await getReviewLogsFromDB();
    const data: ChartDataPoint[] = [];
    
    if (range === 'year') {
        // 12 months
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            d.setDate(1);
            d.setHours(0,0,0,0);
            
            const monthStart = d.getTime();
            
            // End of month
            const nextMonth = new Date(d);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const monthEnd = nextMonth.getTime();

            // Filter logs for this month
            const monthLogs = logs.filter(l => l.timestamp >= monthStart && l.timestamp < monthEnd);
            
            data.push({
                label: d.toLocaleDateString('vi-VN', { month: 'short' }),
                total: monthLogs.length,
                again: monthLogs.filter(l => l.rating === 'again').length,
                hard: monthLogs.filter(l => l.rating === 'hard').length,
                good: monthLogs.filter(l => l.rating === 'good').length,
                easy: monthLogs.filter(l => l.rating === 'easy').length,
            });
        }
    } else {
        // Week (7 days) or Month (30 days)
        const days = range === 'month' ? 30 : 7;
        
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0,0,0,0);
            
            const dayStart = d.getTime();
            const dayEnd = dayStart + ONE_DAY;
            
            const dayLogs = logs.filter(l => l.timestamp >= dayStart && l.timestamp < dayEnd);
            
            // Format: Mon (Week) or 01 (Month)
            const options: Intl.DateTimeFormatOptions = range === 'month' 
                ? { day: 'numeric' }
                : { weekday: 'short' };
                
            data.push({
                label: d.toLocaleDateString('vi-VN', options),
                total: dayLogs.length,
                again: dayLogs.filter(l => l.rating === 'again').length,
                hard: dayLogs.filter(l => l.rating === 'hard').length,
                good: dayLogs.filter(l => l.rating === 'good').length,
                easy: dayLogs.filter(l => l.rating === 'easy').length,
            });
        }
    }
    
    return data;
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