
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
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Lesson States
  const [currentLessonChunks, setCurrentLessonChunks] = useState<ProcessedChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [lessonLanguage, setLessonLanguage] = useState<'en' | 'zh'>('en');
  const [showLesson, setShowLesson] = useState(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);

  // Track total due count
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

  const handleOpenAdmin = () => {
      const password = prompt("Nhập mật khẩu Admin để tiếp tục:");
      if (password === "admin123") {
          setIsAdminAuthenticated(true);
          setShowAdmin(true);
      } else if (password !== null) {
          alert("Mật khẩu không chính xác!");
      }
  };

  // Thuật toán chia nhỏ văn bản thông minh locally
  const smartSplit = (content: string, targetLength: number = 1500): string[] => {
      const paragraphs = content.split(/\n\s*\n/);
      const chunks: string[] = [];
      let buffer = "";

      for (let p of paragraphs) {
          p = p.trim();
          if (!p) continue;
          if (buffer.length + p.length > targetLength) {
              if (buffer) chunks.push(buffer);
              buffer = p;
          } else {
              buffer += (buffer ? "\n\n" : "") + p;
          }
      }
      if (buffer) chunks.push(buffer);
      return chunks;
  };

  const handleLocalTextProcessing = async (text: string, lang: 'en' | 'zh') => {
      setIsProcessingLocal(true);
      setLessonLanguage(lang);
      try {
          const chunks = smartSplit(text);
          const processed: ProcessedChunk[] = chunks.map((t, idx) => ({
              id: idx,
              text: t,
              content: { cleanedSourceText: t, referenceTranslation: "", quiz: [], source: 'Manual' }
          }));
          setCurrentLessonChunks(processed);
          setCurrentChunkIndex(0);
          setShowLesson(true);
      } catch (e) {
          console.error(e);
      } finally {
          setIsProcessingLocal(false);
      }
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
          <div className="min-h-screen bg-slate-50 p-4 md:p-8 animate-in fade-in duration-500">
              <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center px-4 md:px-6">
                  <button onClick={() => setShowLesson(false)} className="px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-500 font-bold hover:text-slate-800 transition-all flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Trở về Dashboard
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tiến độ bài đọc</span>
                    <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full font-black text-xs">
                        {currentChunkIndex + 1} / {currentLessonChunks.length}
                    </div>
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
        {isProcessingLocal && (
            <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mb-4"></div>
                    <div className="font-bold text-slate-600">Đang chuẩn bị nội dung...</div>
                </div>
            </div>
        )}

        <Dashboard 
            onOpenFlashcards={handleStartReview}
            onReviewCards={handleReviewSpecificCards}
            syncKey={syncKey}
            onSetSyncKey={handleSetSyncKey}
            onOpenAdmin={handleOpenAdmin}
            dueCount={totalDueCount}
            isSyncing={isSyncing}
            onManualText={handleLocalTextProcessing}
        />

        {showAdmin && isAdminAuthenticated && <AdminPanel onClose={() => { setShowAdmin(false); setIsAdminAuthenticated(false); }} />}
    </div>
  );
};
export default App;
