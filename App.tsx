import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel'; 
import { FlashcardReview } from './components/FlashcardReview';
import { Flashcard } from './types';
import { getDueFlashcards, setSyncKeyAndSync } from './services/flashcardService';
import { verifyStudentKey } from './services/firebaseService';
import { clearAllFlashcardsFromDB } from './services/db';

const App: React.FC = () => {
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
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
      const due = await getDueFlashcards(); // No deckId = global
      setTotalDueCount(due.length);
  };

  const handleStartReview = async (deckId?: string) => {
      const cards = await getDueFlashcards(deckId);
      if (cards.length === 0) {
          alert("Không có thẻ nào cần ôn tập trong bộ này!");
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
          setDueCards([]);
          setTotalDueCount(0);
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

  if (showReview && dueCards.length > 0) {
      return (
          <FlashcardReview 
              cards={dueCards} 
              onClose={() => { setShowReview(false); updateTotalDueCount(); }} 
              onUpdate={updateTotalDueCount} 
          />
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
        />

        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
};
export default App;