
import React, { useState, useEffect } from 'react';
import { Flashcard, ReviewRating } from '../types';
import { updateCardStatus, getFlashcardStats, FlashcardStats } from '../services/flashcardService';

interface FlashcardReviewProps {
  cards: Flashcard[]; // These are the DUE cards
  onClose: () => void;
  onUpdate: () => void;
}

export const FlashcardReview: React.FC<FlashcardReviewProps> = ({ cards: dueCards, onClose, onUpdate }) => {
  const [view, setView] = useState<'overview' | 'review' | 'summary'>('overview');
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [stats, setStats] = useState<FlashcardStats | null>(null);
  
  // Session stats
  const [sessionCorrect, setSessionCorrect] = useState(0);

  useEffect(() => {
    // Refresh stats when component mounts
    getFlashcardStats().then(setStats);
    setQueue(dueCards);
  }, [dueCards]);

  const playAudio = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleRate = async (rating: ReviewRating) => {
    const currentCard = queue[currentIndex];
    await updateCardStatus(currentCard.id, rating);
    
    if (rating !== 'again') {
        setSessionCorrect(prev => prev + 1);
    }

    // Move next
    if (currentIndex < queue.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(prev => prev + 1), 150);
    } else {
      setView('summary');
      onUpdate();
    }
  };

  const formatInterval = (days: number): string => {
      if (days === 0) return "< 1m";
      if (days < 1) return "1d"; // Should technically be hours but simplified
      if (days < 30) return `${days}d`;
      if (days < 365) return `${Math.round(days/30)}mo`;
      return `${(days/365).toFixed(1)}y`;
  };

  // Pre-calculate next intervals for button labels
  const getIntervalPreview = (rating: ReviewRating) => {
      const card = queue[currentIndex];
      if (!card) return "";
      
      // We simulate the calculation logic here for display
      let interval = card.interval;
      const ease = card.easeFactor || 2.5;

      if (rating === 'again') return "< 1m";
      
      if (interval === 0) interval = 1;
      else if (interval === 1) interval = 6;
      else interval = Math.round(interval * ease);

      if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.5));
      if (rating === 'easy') interval = Math.round(interval * 1.3);
      
      return formatInterval(interval);
  };

  if (view === 'overview') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
             <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in duration-300">
                 <div className="flex justify-between items-center mb-8">
                     <h2 className="text-2xl font-bold text-slate-800">Thống kê học tập</h2>
                     <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                 </div>

                 {stats ? (
                     <div className="space-y-6">
                         <div className="grid grid-cols-2 gap-4">
                             <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 text-center">
                                 <div className="text-3xl font-black text-indigo-600 mb-1">{stats.total}</div>
                                 <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Tổng số từ</div>
                             </div>
                             <div className="bg-red-50 p-5 rounded-2xl border border-red-100 text-center relative overflow-hidden">
                                 <div className="absolute top-0 right-0 p-1 bg-red-200 rounded-bl-xl text-[10px] font-bold text-red-700">Cần ôn ngay</div>
                                 <div className="text-3xl font-black text-red-600 mb-1">{stats.due}</div>
                                 <div className="text-xs font-bold text-red-400 uppercase tracking-wider">Đến hạn ôn</div>
                             </div>
                         </div>

                         <div className="space-y-3">
                             <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Trạng thái bộ nhớ</h3>
                             <div className="flex h-4 rounded-full overflow-hidden w-full bg-slate-100">
                                 <div className="bg-blue-400 h-full" style={{width: `${(stats.new / stats.total) * 100}%`}} title="Mới"></div>
                                 <div className="bg-orange-400 h-full" style={{width: `${(stats.learning / stats.total) * 100}%`}} title="Đang học"></div>
                                 <div className="bg-green-500 h-full" style={{width: `${(stats.review / stats.total) * 100}%`}} title="Ôn tập"></div>
                                 <div className="bg-emerald-700 h-full" style={{width: `${(stats.mastered / stats.total) * 100}%`}} title="Thành thạo"></div>
                             </div>
                             <div className="flex justify-between text-xs text-slate-500 font-medium px-1">
                                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400"></div> New ({stats.new})</span>
                                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400"></div> Learning ({stats.learning})</span>
                                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Review ({stats.review})</span>
                                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-700"></div> Master ({stats.mastered})</span>
                             </div>
                         </div>
                     </div>
                 ) : (
                     <div className="text-center py-10">Đang tải thống kê...</div>
                 )}

                 <button 
                    onClick={() => setView(queue.length > 0 ? 'review' : 'overview')}
                    disabled={queue.length === 0}
                    className="w-full mt-8 py-4 bg-slate-900 text-white font-bold text-lg rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-300 transition-all active:scale-95"
                 >
                    {queue.length > 0 ? `Bắt đầu ôn tập (${queue.length} thẻ)` : 'Không có thẻ nào cần ôn'}
                 </button>
             </div>
        </div>
      );
  }

  if (view === 'summary') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center animate-in zoom-in">
                <div className="text-6xl mb-6">🎉</div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Hoàn thành phiên học!</h2>
                <p className="text-slate-500 mb-8">Bạn đã ôn tập {queue.length} thẻ. Hãy quay lại sau để tối ưu hóa trí nhớ nhé.</p>
                <button 
                    onClick={onClose}
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700"
                >
                    Đóng
                </button>
            </div>
        </div>
      );
  }

  // REVIEW MODE
  const currentCard = queue[currentIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 bg-opacity-95 p-4">
      <div className="w-full max-w-2xl h-[85vh] flex flex-col">
        
        {/* Top Bar */}
        <div className="flex justify-between items-center text-white/80 mb-4 px-2">
            <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest opacity-60">Flashcards</span>
                <span className="font-mono text-sm">{currentIndex + 1} / {queue.length}</span>
            </div>
            <button onClick={onClose} className="hover:text-white hover:bg-white/10 p-2 rounded-full transition-all">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Card Area */}
        <div className="flex-1 perspective-1000 relative mb-6">
             <div 
                className={`w-full h-full relative transition-all duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                onClick={() => setIsFlipped(!isFlipped)}
              >
                {/* FRONT */}
                <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 text-center border-b-8 border-slate-200">
                    <span className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-8">Từ vựng</span>
                    <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">{currentCard.term}</h2>
                    <span className="text-slate-400 font-mono text-xl">/{currentCard.phonetic}/</span>
                    
                    <button 
                        onClick={(e) => { e.stopPropagation(); playAudio(currentCard.term); }}
                        className="mt-8 p-4 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 hover:scale-110 transition-all shadow-sm"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    </button>
                    
                    <p className="absolute bottom-6 text-sm text-slate-300 font-medium">Chạm để xem nghĩa</p>
                </div>

                {/* BACK */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-50 rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 text-center border-b-8 border-slate-200">
                    <div className="w-full max-w-md">
                        <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-4 block">Định nghĩa</span>
                        <p className="text-3xl font-bold text-slate-800 mb-6 leading-relaxed">{currentCard.meaning}</p>
                        
                        <div className="w-full h-px bg-slate-200 my-6"></div>
                        
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Ngữ cảnh</span>
                        <p className="text-slate-600 text-lg leading-relaxed italic">
                            "{currentCard.explanation}"
                        </p>
                    </div>
                </div>
            </div>
        </div>

        {/* Action Buttons */}
        <div className={`grid grid-cols-4 gap-3 transition-all duration-300 ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            <button onClick={() => handleRate('again')} className="bg-red-100 hover:bg-red-200 text-red-700 py-3 px-1 rounded-xl flex flex-col items-center border-b-4 border-red-200 active:border-b-0 active:translate-y-1 transition-all">
                <span className="text-xs font-bold mb-1">{getIntervalPreview('again')}</span>
                <span className="font-bold text-lg">Again</span>
            </button>
            <button onClick={() => handleRate('hard')} className="bg-orange-100 hover:bg-orange-200 text-orange-700 py-3 px-1 rounded-xl flex flex-col items-center border-b-4 border-orange-200 active:border-b-0 active:translate-y-1 transition-all">
                <span className="text-xs font-bold mb-1">{getIntervalPreview('hard')}</span>
                <span className="font-bold text-lg">Hard</span>
            </button>
            <button onClick={() => handleRate('good')} className="bg-green-100 hover:bg-green-200 text-green-700 py-3 px-1 rounded-xl flex flex-col items-center border-b-4 border-green-200 active:border-b-0 active:translate-y-1 transition-all">
                <span className="text-xs font-bold mb-1">{getIntervalPreview('good')}</span>
                <span className="font-bold text-lg">Good</span>
            </button>
            <button onClick={() => handleRate('easy')} className="bg-sky-100 hover:bg-sky-200 text-sky-700 py-3 px-1 rounded-xl flex flex-col items-center border-b-4 border-sky-200 active:border-b-0 active:translate-y-1 transition-all">
                <span className="text-xs font-bold mb-1">{getIntervalPreview('easy')}</span>
                <span className="font-bold text-lg">Easy</span>
            </button>
        </div>
        
        {/* Spacer for non-flipped state to maintain layout */}
        {!isFlipped && <div className="h-[84px] flex items-center justify-center text-white/30 text-sm animate-pulse">Đang chờ lật thẻ...</div>}

      </div>
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};
