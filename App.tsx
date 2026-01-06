import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel'; 
import { FlashcardReview } from './components/FlashcardReview';
import { LessonView } from './components/LessonView';
import { Flashcard, ProcessedChunk, LessonContent } from './types';
import { getDueFlashcards, setSyncKeyAndSync, saveFlashcard } from './services/flashcardService';
import { verifyStudentKey } from './services/firebaseService';
import { clearAllFlashcardsFromDB } from './services/db';

const App: React.FC = () => {
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Lesson States
  const [currentLessonChunks, setCurrentLessonChunks] = useState<ProcessedChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [lessonLanguage, setLessonLanguage] = useState<'en' | 'zh'>('en');
  const [showLesson, setShowLesson] = useState(false);

  // Track total due count for dashboard badge
  const [totalDueCount, setTotalDueCount] = useState(0);

  useEffect(() => {
    const storedKey = localStorage.getItem('paperlingo_sync_key');
    if (storedKey) {
        setSyncKey(storedKey);
        setIsSyncing(true);
        setSyncKeyAndSync(storedKey).then(() => {
            updateTotalDueCount();
            setIsSyncing(false);
        });
    } else {
        updateTotalDueCount();
    }
  }, []);

  const updateTotalDueCount = async () => { 
      const due = await getDueFlashcards();
      setTotalDueCount(due.length);
  };

  const handleStartReview = async (deckId?: string) => {
      const cards = await getDueFlashcards(deckId);
      if (cards.length === 0) {
          alert("Không có thẻ nào cần ôn tập!");
          return;
      }
      setDueCards(cards);
      setShowReview(true);
  };

  const handleReviewSpecificCards = (cards: Flashcard[]) => {
      if (cards.length === 0) return;
      setDueCards(cards);
      setShowReview(true);
  };

  const handleSetSyncKey = async (key: string) => {
      if (!key) {
          localStorage.removeItem('paperlingo_sync_key');
          setSyncKey(null);
          await clearAllFlashcardsFromDB();
          window.location.reload();
          return;
      }
      setIsSyncing(true);
      const isValid = await verifyStudentKey(key);
      if (!isValid) { 
          alert("Mã không hợp lệ!"); 
          setIsSyncing(false);
          return; 
      }
      setSyncKey(key);
      localStorage.setItem('paperlingo_sync_key', key);
      await setSyncKeyAndSync(key); 
      await updateTotalDueCount();
      setIsSyncing(false);
  };

  // Manual Translation Handler (No AI Processing)
  const handleManualTranslation = (text: string, lang: 'en' | 'zh') => {
      setLessonLanguage(lang);
      const chunk: ProcessedChunk = {
          id: 0,
          text: text,
          content: {
              cleanedSourceText: text,
              referenceTranslation: "",
              quiz: [],
              source: 'Manual'
          }
      };
      setCurrentLessonChunks([chunk]);
      setCurrentChunkIndex(0);
      setShowLesson(true);
  };

  const handleUpdateChunkContent = (id: number, content: LessonContent) => {
      setCurrentLessonChunks(prev => prev.map(c => c.id === id ? { ...c, content } : c));
  };

  const handleAddFlashcard = async (term: string, meaning: string, explanation: string, phonetic: string) => {
      const success = await saveFlashcard({ term, meaning, explanation, phonetic });
      if (success) updateTotalDueCount();
  };

  if (showReview && dueCards.length > 0) {
      return (
          <FlashcardReview 
              cards={dueCards} 
              onClose={() => { setShowReview(false); updateTotalDueCount(); }} 
              onUpdate={updateTotalDueCount} 
          />
      );
  }

  if (showLesson && currentLessonChunks.length > 0) {
      const currentChunk = currentLessonChunks[currentChunkIndex];
      return (
          <div className="min-h-screen bg-slate-50 p-4 md:p-8">
              <div className="max-w-4xl mx-auto mb-6 flex justify-between items-center">
                  <button onClick={() => setShowLesson(false)} className="text-slate-500 font-bold hover:text-slate-800">← Thoát</button>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Luyện dịch thủ công
                  </div>
              </div>
              <LessonView 
                  chunk={currentChunk}
                  totalChunks={currentLessonChunks.length}
                  language={lessonLanguage}
                  onComplete={() => {}}
                  onNext={() => setCurrentChunkIndex(prev => Math.min(prev + 1, currentLessonChunks.length - 1))}
                  onLookup={handleAddFlashcard}
                  onContentUpdate={handleUpdateChunkContent}
                  isLast={currentChunkIndex === currentLessonChunks.length - 1}
              />
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        {isSyncing && (
            <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mb-4"></div>
                    <div className="font-bold text-slate-600">Đang đồng bộ dữ liệu...</div>
                </div>
            </div>
        )}

        <Dashboard 
            onOpenFlashcards={handleStartReview}
            onReviewCards={handleReviewSpecificCards}
            syncKey={syncKey}
            onSetSyncKey={handleSetSyncKey}
            onOpenAdmin={() => setShowAdmin(true)}
            dueCount={totalDueCount}
            isSyncing={isSyncing}
            onManualText={handleManualTranslation}
        />

        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
};
export default App;