
export interface KeyTerm {
  term: string;
  meaning: string;
}

export interface LessonContent {
  cleanedSourceText: string; 
  referenceTranslation: string; 
  keyTerms: KeyTerm[]; 
  source?: 'AI' | 'Fallback'; 
}

export interface ProcessedChunk {
  id: number;
  text: string; 
  isCompleted: boolean;
  content?: LessonContent; 
}

export interface SavedPaper {
  id: string; // UUID
  fileName: string;
  originalText: string;
  processedChunks: ProcessedChunk[];
  currentChunkIndex: number;
  createdAt: number;
  lastOpened: number;
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface Flashcard {
  id: string;
  term: string;
  meaning: string;
  explanation: string;
  phonetic: string;
  
  // SRS Fields
  level: number; // 0: New, 1: Learning, 2+: Review/Mastered
  nextReview: number; // Timestamp
  createdAt: number;
  
  // Advanced SRS
  easeFactor: number; // Default 2.5
  interval: number; // Days
  repetitions: number; // Consecutive correct reviews
}

declare global {
  const pdfjsLib: any;
}
