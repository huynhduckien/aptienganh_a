
export interface DictionaryResponse {
  shortMeaning: string;
  phonetic: string;
  detailedExplanation: string;
  originalTerm?: string;
}

export interface GradingResult {
  score: number;
  feedback: string;
  modelTranslation: string;
  strengths: string[];
  improvements: string[];
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
  
  deckId?: string; 

  // SRS Fields
  level: number; 
  nextReview: number; 
  createdAt: number;
  lastUpdated?: number; 
  
  // Advanced SRS
  easeFactor: number; 
  interval: number; 
  repetitions: number; 
  
  // Anki Learning Steps tracker
  step?: number; 

  // FORGOTTEN STATE
  isForgotten?: boolean; 
}

export interface ReviewLog {
    id: string;
    cardId: string;
    rating: ReviewRating;
    timestamp: number;
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
    forgotten: number; 
}

export interface LessonContent {
  cleanedSourceText: string;
  referenceTranslation: string;
  quiz: any[];
  source: 'AI' | 'Fallback' | 'Manual';
}

export interface ProcessedChunk {
  id: number;
  text: string;
  content?: LessonContent;
}

// FIX: Added missing exported interfaces used in firebaseService and flashcardService
export interface StudentAccount {
  key: string;
  name: string;
  createdAt: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}
