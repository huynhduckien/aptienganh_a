
export interface KeyTerm {
  term: string;
  meaning: string;
}

export interface LessonContent {
  cleanedSourceText: string; // The AI-cleaned version of the source text (no headers/footers)
  referenceTranslation: string; // The AI's full translation of the chunk
  keyTerms: KeyTerm[]; // Explanations for difficult words/phrases in this specific chunk
}

export interface ProcessedChunk {
  id: number;
  text: string; // The raw English text
  isCompleted: boolean;
  content?: LessonContent; // Populated by AI
}

// SRS Flashcard Structure
export interface Flashcard {
  id: string;
  term: string;
  meaning: string;
  explanation: string;
  phonetic: string;
  level: number; // 0 = New, 1+ = Learned levels
  nextReview: number; // Timestamp
  createdAt: number;
}

// Declaration for the global PDF.js library loaded via CDN
declare global {
  const pdfjsLib: any;
}
