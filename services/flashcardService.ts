
import { Flashcard } from "../types";
import { getFlashcardsFromDB, saveFlashcardToDB, generateId } from "./db";
import { fetchCloudFlashcards, saveCloudFlashcard } from "./firebaseService";

let hasSynced = false;

export const getFlashcards = async (): Promise<Flashcard[]> => {
  try {
    // 1. Lấy dữ liệu Local trước để hiển thị ngay
    let localCards = await getFlashcardsFromDB();

    // 2. Nếu chưa đồng bộ lần nào, thử lấy từ Cloud về và gộp vào
    if (!hasSynced && navigator.onLine) {
       const cloudCards = await fetchCloudFlashcards();
       if (cloudCards.length > 0) {
           // Gộp Cloud vào Local (ưu tiên Cloud nếu trùng ID)
           const mergedMap = new Map<string, Flashcard>();
           localCards.forEach(c => mergedMap.set(c.id, c));
           cloudCards.forEach(c => mergedMap.set(c.id, c));
           
           const mergedCards = Array.from(mergedMap.values());
           
           // Lưu ngược lại vào Local để lần sau dùng offline
           for (const card of mergedCards) {
               await saveFlashcardToDB(card);
           }
           
           localCards = mergedCards;
       }
       hasSynced = true;
    }

    return localCards;
  } catch (e) {
    console.warn("Failed to load flashcards", e);
    return [];
  }
};

export const saveFlashcard = async (card: Omit<Flashcard, 'id' | 'level' | 'nextReview' | 'createdAt'>): Promise<boolean> => {
  const cards = await getFlashcards();
  
  if (cards.some(c => c.term.toLowerCase() === card.term.toLowerCase())) {
    return false; 
  }

  const newCard: Flashcard = {
    ...card,
    id: generateId(),
    level: 0,
    nextReview: Date.now(),
    createdAt: Date.now()
  };

  // 1. Lưu Local (cho nhanh)
  await saveFlashcardToDB(newCard);
  
  // 2. Lưu Cloud (background)
  saveCloudFlashcard(newCard);

  return true;
};

export const getDueFlashcards = async (): Promise<Flashcard[]> => {
  const cards = await getFlashcards();
  const now = Date.now();
  return cards.filter(card => card.nextReview <= now);
};

export const updateCardStatus = async (cardId: string, remembered: boolean): Promise<void> => {
  const cards = await getFlashcards();
  const index = cards.findIndex(c => c.id === cardId);
  
  if (index === -1) return;

  const card = cards[index];
  let nextReview = Date.now();
  let newLevel = card.level;

  if (remembered) {
    newLevel = card.level + 1;
    switch (newLevel) {
      case 1: nextReview += 24 * 60 * 60 * 1000; break; 
      case 2: nextReview += 3 * 24 * 60 * 60 * 1000; break; 
      case 3: nextReview += 7 * 24 * 60 * 60 * 1000; break; 
      case 4: nextReview += 14 * 24 * 60 * 60 * 1000; break; 
      default: nextReview += 30 * 24 * 60 * 60 * 1000; break; 
    }
  } else {
    newLevel = 0;
    nextReview += 10 * 60 * 1000; 
  }

  const updatedCard = { ...card, level: newLevel, nextReview };
  
  // 1. Lưu Local
  await saveFlashcardToDB(updatedCard);

  // 2. Lưu Cloud
  saveCloudFlashcard(updatedCard);
};
