import React, { useState, useEffect } from 'react';
import { Flashcard } from '../types';
import { updateCardStatus } from '../services/flashcardService';

interface FlashcardReviewProps {
  cards: Flashcard[];
  onClose: () => void;
  onUpdate: () => void; // Trigger refresh count
}

export const FlashcardReview: React.FC<FlashcardReviewProps> = ({ cards: initialCards, onClose, onUpdate }) => {
  const [queue, setQueue] = useState<Flashcard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (initialCards.length === 0) setFinished(true);
  }, [initialCards]);

  const playAudio = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const handleRate = async (remembered: boolean) => {
    const currentCard = queue[currentIndex];
    await updateCardStatus(currentCard.id, remembered);
    
    // Move to next
    if (currentIndex < queue.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(prev => prev + 1), 150);
    } else {
      setFinished(true);
      onUpdate();
    }
  };

  if (initialCards.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-[500px] animate-in zoom-in duration-300">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <span className="font-bold text-slate-700">Ôn tập từ vựng</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col p-6 items-center justify-center relative bg-slate-50">
          
          {!finished ? (
            <div className="w-full h-80 relative perspective-1000">
              <div 
                className={`w-full h-full relative transition-all duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                onClick={() => setIsFlipped(!isFlipped)}
              >
                {/* FRONT */}
                <div className="absolute inset-0 backface-hidden bg-white rounded-2xl shadow-lg border-2 border-slate-200 flex flex-col items-center justify-center p-6 hover:border-indigo-300 transition-colors">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Từ vựng</span>
                  <h2 className="text-4xl font-serif font-bold text-slate-800 text-center mb-2">{queue[currentIndex].term}</h2>
                  {queue[currentIndex].phonetic && (
                     <span className="text-slate-500 font-mono text-lg mb-6">/{queue[currentIndex].phonetic}/</span>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); playAudio(queue[currentIndex].term); }}
                    className="p-3 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </button>
                  <p className="absolute bottom-4 text-xs text-slate-400 animate-pulse">Chạm để lật thẻ</p>
                </div>

                {/* BACK */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-50 rounded-2xl shadow-lg border-2 border-indigo-200 flex flex-col items-center justify-center p-6 text-center">
                   <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-4">Ý nghĩa</span>
                   <p className="text-2xl font-bold text-indigo-900 mb-4">{queue[currentIndex].meaning}</p>
                   <p className="text-slate-600 text-sm leading-relaxed border-t border-indigo-200 pt-4 w-full">
                     {queue[currentIndex].explanation}
                   </p>
                </div>
              </div>
            </div>
          ) : (
             <div className="text-center animate-in zoom-in">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Hoàn thành xuất sắc!</h3>
                <p className="text-slate-500">Bạn đã ôn tập hết các từ vựng cần thiết.</p>
             </div>
          )}

        </div>

        {/* Controls */}
        <div className="p-6 bg-white border-t border-slate-100">
           {!finished ? (
             <div className="flex gap-4">
                <button 
                    onClick={() => handleRate(false)}
                    className="flex-1 py-4 rounded-xl border-2 border-red-100 bg-red-50 text-red-600 font-bold text-lg hover:bg-red-100 hover:border-red-200 transition-all active:scale-95"
                >
                    Quên 😓
                </button>
                <button 
                    onClick={() => handleRate(true)}
                    className="flex-1 py-4 rounded-xl border-2 border-green-100 bg-green-50 text-green-600 font-bold text-lg hover:bg-green-100 hover:border-green-200 transition-all active:scale-95"
                >
                    Đã nhớ 😎
                </button>
             </div>
           ) : (
             <button 
                onClick={onClose}
                className="w-full py-4 rounded-xl bg-slate-800 text-white font-bold text-lg hover:bg-slate-700 transition-all"
            >
                Đóng
            </button>
           )}
           {!finished && (
             <div className="text-center mt-4 text-xs font-medium text-slate-400">
               Thẻ {currentIndex + 1} / {queue.length}
             </div>
           )}
        </div>

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