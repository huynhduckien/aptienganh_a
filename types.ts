
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

export interface Flashcard {
  id: string;
  term: string;
  meaning: string;
  explanation: string;
  phonetic: string;
  level: number; 
  nextReview: number; 
  createdAt: number;
}

declare global {
  const pdfjsLib: any;
}
