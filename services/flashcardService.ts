import { Flashcard } from "../types";
import { getFlashcardsFromDB, saveFlashcardToDB, generateId } from "./db";

export const getFlashcards = async (): Promise<Flashcard[]> => {
  try {
    return await getFlashcardsFromDB();
  } catch (e) {
    console.warn("Failed to load flashcards", e);
    return [];
  }
};

export const saveFlashcard = async (card: Omit<Flashcard, 'id' | 'level' | 'nextReview' | 'createdAt'>): Promise<boolean> => {
  const cards = await getFlashcards();
  
  // Check for duplicates
  if (cards.some(c => c.term.toLowerCase() === card.term.toLowerCase())) {
    return false; // Already exists
  }

  const newCard: Flashcard = {
    ...card,
    id: generateId(),
    level: 0,
    nextReview: Date.now(), // Ready immediately
    createdAt: Date.now()
  };

  await saveFlashcardToDB(newCard);
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
    // Spaced Repetition Logic (SuperMemo 2 simplified)
    newLevel = card.level + 1;
    switch (newLevel) {
      case 1: nextReview += 24 * 60 * 60 * 1000; break; // 1 day
      case 2: nextReview += 3 * 24 * 60 * 60 * 1000; break; // 3 days
      case 3: nextReview += 7 * 24 * 60 * 60 * 1000; break; // 1 week
      case 4: nextReview += 14 * 24 * 60 * 60 * 1000; break; // 2 weeks
      default: nextReview += 30 * 24 * 60 * 60 * 1000; break; // 1 month
    }
  } else {
    newLevel = 0;
    nextReview += 10 * 60 * 1000; // 10 minutes
  }

  const updatedCard = { ...card, level: newLevel, nextReview };
  await saveFlashcardToDB(updatedCard);
};