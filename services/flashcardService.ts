
import { Flashcard, ReviewRating } from "../types";
import { getFlashcardsFromDB, saveFlashcardToDB, generateId } from "./db";
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
}

export const setSyncKeyAndSync = async (key: string): Promise<void> => {
    setFirebaseSyncKey(key);
    hasSynced = false;
    await getFlashcards();
};

export const getFlashcards = async (): Promise<Flashcard[]> => {
  try {
    let localCards = await getFlashcardsFromDB();

    // Sync logic: Chỉ chạy 1 lần khi mở app (hoặc khi cần thiết)
    if (!hasSynced && navigator.onLine) {
       const cloudCards = await fetchCloudFlashcards();
       
       if (cloudCards.length > 0) {
           const mergedMap = new Map<string, Flashcard>();
           
           // 1. Đưa local cards vào map trước
           localCards.forEach(c => mergedMap.set(c.id, c));
           
           // 2. Hợp nhất với Cloud cards (Smart Merge)
           for (const cloudCard of cloudCards) {
               const localCard = mergedMap.get(cloudCard.id);
               
               if (!localCard) {
                   // Nếu máy chưa có -> Lấy từ Cloud về
                   mergedMap.set(cloudCard.id, cloudCard);
                   await saveFlashcardToDB(cloudCard);
               } else {
                   // Nếu máy đã có -> So sánh xem cái nào "xịn" hơn (học nhiều hơn)
                   // Ưu tiên bản nào có số lần học (repetitions) lớn hơn hoặc ngày review xa hơn
                   const localProgress = (localCard.repetitions || 0) + (localCard.interval || 0);
                   const cloudProgress = (cloudCard.repetitions || 0) + (cloudCard.interval || 0);
                   
                   if (cloudProgress > localProgress) {
                       // Cloud mới hơn -> Cập nhật Local
                       mergedMap.set(cloudCard.id, cloudCard);
                       await saveFlashcardToDB(cloudCard);
                   } else if (localProgress > cloudProgress) {
                       // Local mới hơn (học offline) -> Đẩy ngược lên Cloud
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

export const getDueFlashcards = async (): Promise<Flashcard[]> => {
  const cards = await getFlashcards();
  const now = Date.now();
  return cards.filter(card => card.nextReview <= now).sort((a,b) => a.nextReview - b.nextReview);
};

export const getFlashcardStats = async (): Promise<FlashcardStats> => {
    const cards = await getFlashcards();
    const now = Date.now();
    
    return {
        total: cards.length,
        due: cards.filter(c => c.nextReview <= now).length,
        new: cards.filter(c => c.repetitions === 0).length,
        learning: cards.filter(c => c.repetitions > 0 && c.interval < 21).length, // < 3 weeks
        review: cards.filter(c => c.interval >= 21).length,
        mastered: cards.filter(c => c.interval > 90).length // > 3 months
    };
};

// --- SM-2 ALGORITHM ---
// Adapted for better short-term steps
export const calculateNextReview = (card: Flashcard, rating: ReviewRating): { nextReview: number, interval: number, easeFactor: number, repetitions: number } => {
    let { interval, easeFactor, repetitions } = card;
    const now = Date.now();

    if (rating === 'again') {
        // Reset progress
        repetitions = 0;
        interval = 0; 
        // Next review in 1 minute
        return { 
            nextReview: now + ONE_MINUTE, 
            interval: 0, 
            easeFactor: Math.max(1.3, easeFactor - 0.2), 
            repetitions: 0 
        };
    }

    // HARD / GOOD / EASY
    if (interval === 0) {
        // First success
        interval = 1; // 1 day
    } else if (interval === 1) {
        // Second success
        interval = 6; // 6 days
    } else {
        // Subsequent successes
        interval = Math.round(interval * easeFactor);
    }

    // Adjustments based on rating
    if (rating === 'hard') {
        interval = Math.max(1, Math.round(interval * 0.5)); // Drop interval significantly
        easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else if (rating === 'easy') {
        interval = Math.round(interval * 1.3); // Bonus boost
        easeFactor += 0.15;
    } else {
        // Good: Standard SM-2 calc
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
      level: interval > 21 ? 2 : 1 // Simple bucket for UI
  };
  
  // Lưu cả Local và Cloud
  await saveFlashcardToDB(updatedCard);
  saveCloudFlashcard(updatedCard);
};
