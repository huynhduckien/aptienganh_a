
export interface DictionaryResponse {
  shortMeaning: string;
  phonetic: string;
  detailedExplanation: string;
  originalTerm?: string;
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface Deck {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface Flashcard {
  id: string;
  term: string;
  meaning: string;
  explanation: string;
  phonetic: string;
  
  deckId?: string; // New field to link card to a deck

  // SRS Fields
  level: number; // 0: New, 1: Learning, 2+: Review/Mastered
  nextReview: number; // Timestamp
  createdAt: number;
  lastUpdated?: number; // NEW: Timestamp for sync resolution (Last Write Wins)
  
  // Advanced SRS
  easeFactor: number; // Default 2.5
  interval: number; // Days (if >= 1) or Minutes (if < 1)
  repetitions: number; // Consecutive correct reviews
  
  // NEW: Anki Learning Steps tracker
  step?: number; // 0 = 1st step (1m), 1 = 2nd step (10m), etc.

  // FORGOTTEN STATE
  isForgotten?: boolean; // True if user rated 'Again', cleared when 'Good'/'Easy'
}

export interface ReviewLog {
    id: string;
    cardId: string;
    rating: ReviewRating;
    timestamp: number;
}

export interface StudentAccount {
    key: string;
    name: string;
    createdAt: number;
    lastActive?: number;
}

export interface AnkiStats {
    today: {
        studied: number;
        limit: number;
        againCount: number;
        matureCount: number;
    };
    forecast: {
        young: number[];
        mature: number[]; 
        labels: string[];
        maxTotal: number;
    };
    counts: {
        new: number;       
        learning: number;  
        young: number;     
        mature: number;    
        suspended: number; 
        total: number;
    };
    intervals: {
        labels: string[];
        data: number[];
    };
    due: number;
    forgotten: number; // New stat
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface LessonContent {
  cleanedSourceText: string;
  referenceTranslation: string;
  quiz: QuizQuestion[];
  source: 'AI' | 'Fallback';
}

export interface ProcessedChunk {
  id: number;
  text: string;
  content?: LessonContent;
}
