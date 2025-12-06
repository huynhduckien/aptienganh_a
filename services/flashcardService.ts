
import { Flashcard } from "../types";

const STORAGE_KEY = 'paperlingo_flashcards';

export const getFlashcards = (): Flashcard[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn("Failed to load flashcards", e);
    return [];
  }
};

export const saveFlashcard = (card: Omit<Flashcard, 'id' | 'level' | 'nextReview' | 'createdAt'>): boolean => {
  const cards = getFlashcards();
  
  // Check for duplicates
  if (cards.some(c => c.term.toLowerCase() === card.term.toLowerCase())) {
    return false; // Already exists
  }

  const newCard: Flashcard = {
    ...card,
    id: crypto.randomUUID(),
    level: 0,
    nextReview: Date.now(), // Ready immediately
    createdAt: Date.now()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify([...cards, newCard]));
  return true;
};

export const getDueFlashcards = (): Flashcard[] => {
  const cards = getFlashcards();
  const now = Date.now();
  return cards.filter(card => card.nextReview <= now);
};

export const updateCardStatus = (cardId: string, remembered: boolean) => {
  const cards = getFlashcards();
  const index = cards.findIndex(c => c.id === cardId);
  
  if (index === -1) return;

  const card = cards[index];
  let nextReview = Date.now();
  let newLevel = card.level;

  if (remembered) {
    // Spaced Repetition Logic
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

  cards[index] = { ...card, level: newLevel, nextReview };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
};
