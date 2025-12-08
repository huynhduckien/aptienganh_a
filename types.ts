

export interface KeyTerm {
  term: string;
  meaning: string;
}

export interface DictionaryResponse {
  shortMeaning: string;
  phonetic: string;
  detailedExplanation: string;
  originalTerm?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[]; // [A, B, C]
  correctAnswer: number; // Index 0, 1, or 2
  explanation: string;
}

export interface LessonContent {
  cleanedSourceText: string; 
  referenceTranslation: string; 
  keyTerms: KeyTerm[]; 
  quiz?: QuizQuestion[]; // NEW: Trắc nghiệm
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
  language: 'en' | 'zh'; // NEW: Language flag
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
  interval: number; // Days (if >= 1) or Minutes (if < 1)
  repetitions: number; // Consecutive correct reviews
  
  // NEW: Anki Learning Steps tracker
  step?: number; // 0 = 1st step (1m), 1 = 2nd step (10m), etc.
}

// NEW: Log lịch sử ôn tập để vẽ biểu đồ
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

export interface ChartDataPoint {
    label: string;
    total: number;
    again: number;
    hard: number;
    good: number;
    easy: number;
}

// NEW: Cấu trúc dữ liệu cho Dashboard chuẩn Anki
export interface AnkiStats {
    today: {
        studied: number;
        limit: number;
        againCount: number;
        matureCount: number; // Thẻ đã học xong trong ngày
    };
    forecast: {
        // [daysFromNow]: count
        // UPDATE: Split into Young (<21 days) and Mature (>=21 days) for stacked chart
        young: number[];
        mature: number[]; 
        labels: string[];
        maxTotal: number; // Helper for scaling
    };
    counts: {
        new: number;       // Chưa học
        learning: number;  // Đang học (< 21 ngày)
        young: number;     // < 21 ngày interval
        mature: number;    // >= 21 ngày interval
        suspended: number; // Tạm hoãn (nếu có tính năng này sau này)
        total: number;
    };
    intervals: {
        // Phân phối khoảng cách ôn tập
        labels: string[];
        data: number[];
    };
}

declare global {
  const pdfjsLib: any;
}