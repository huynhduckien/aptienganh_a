
import React, { useState, useEffect, useCallback } from 'react';
import { Flashcard, ReviewRating } from '../types';
import { updateCardStatus, getIntervalPreviewText } from '../services/flashcardService';

interface FlashcardReviewProps {
  cards: Flashcard[];
  onClose: () => void;
  onUpdate: () => void;
}

export const FlashcardReview: React.FC<FlashcardReviewProps> = ({ cards: initialCards, onClose, onUpdate }) => {
  const [queue] = useState<Flashcard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());

  // Navigation Logic
  const handleNext = useCallback(() => {
      if (currentIndex < queue.length - 1) {
          setIsFlipped(false);
          setCurrentIndex(prev => prev + 1);
      }
  }, [currentIndex, queue.length]);

  const handlePrev = useCallback(() => {
      if (currentIndex > 0) {
          setIsFlipped(false);
          setCurrentIndex(prev => prev - 1);
      }
  }, [currentIndex]);

  // Keyboard Shortcuts
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
      if (finished) return;
      
      switch (event.code) {
          case 'Space':
          case 'Enter':
              // Toggle flip state instead of just setting true
              setIsFlipped(prev => !prev);
              break;
          case 'ArrowLeft':
              handlePrev();
              break;
          case 'ArrowRight':
              handleNext();
              break;
          case 'Digit1':
          case 'Numpad1':
              if (isFlipped) handleRate('again');
              break;
          case 'Digit2':
          case 'Numpad2':
              if (isFlipped) handleRate('hard');
              break;
          case 'Digit3':
          case 'Numpad3':
              if (isFlipped) handleRate('good');
              break;
          case 'Digit4':
          case 'Numpad4':
              if (isFlipped) handleRate('easy');
              break;
      }
  }, [isFlipped, finished, currentIndex, handlePrev, handleNext]); 

  // Attach event listener
  useEffect(() => {
      const handler = (e: KeyboardEvent) => handleKeyDown(e);
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
  }, [handleKeyDown]);

  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (/[\u4e00-\u9fa5]/.test(text)) utterance.lang = 'zh-CN';
        else if (/[éàèùâêîôûëïüÿçœæ]/i.test(text)) utterance.lang = 'fr-FR';
        else utterance.lang = 'en-US';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
  };

  const handleRate = async (rating: ReviewRating) => {
    const currentCard = queue[currentIndex];
    await updateCardStatus(currentCard.id, rating);
    
    if (currentIndex < queue.length - 1) {
      setIsFlipped(false);
      setCurrentIndex(prev => prev + 1);
    } else {
      setFinished(true);
      onUpdate();
    }
  };

  // SUMMARY VIEW
  if (finished) {
      const duration = Math.round((Date.now() - startTime) / 1000 / 60);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 animate-in fade-in duration-500">
            <div className="bg-white w-full max-w-md rounded-[32px] p-8 text-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-emerald-600"></div>
                <div className="text-6xl mb-6 animate-bounce">🎉</div>
                <h2 className="text-3xl font-black text-slate-800 mb-2">Hoàn thành!</h2>
                <p className="text-slate-500 mb-8 text-lg">
                    Bạn đã ôn tập <span className="font-bold text-slate-900">{queue.length}</span> thẻ trong {duration < 1 ? 'chưa đầy 1 phút' : `${duration} phút`}.
                </p>
                <button 
                    onClick={onClose}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 hover:scale-105 transition-all text-lg"
                >
                    Trở về Dashboard
                </button>
            </div>
        </div>
      );
  }

  const currentCard = queue[currentIndex];
  const progress = ((currentIndex) / queue.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 font-sans">
      
      {/* TOP BAR */}
      <div className="px-6 py-4 flex items-center justify-between bg-white border-b border-slate-100 shadow-sm z-10">
          <div className="flex items-center gap-4 flex-1">
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 font-bold transition-colors">✕</button>
              <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden max-w-md">
                  <div className="h-full bg-indigo-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
              </div>
              <span className="text-xs font-bold text-slate-400 font-mono w-12 text-right">{currentIndex + 1}/{queue.length}</span>
          </div>
      </div>

      {/* MAIN CARD AREA */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 perspective-1000 relative">
          
          {/* NAVIGATION BUTTONS */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 md:px-12 pointer-events-none z-20">
                <button 
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className={`pointer-events-auto w-12 h-12 rounded-full bg-white shadow-lg border border-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all ${currentIndex === 0 ? 'opacity-0' : 'opacity-100'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                <button 
                    onClick={handleNext}
                    disabled={currentIndex === queue.length - 1}
                    className={`pointer-events-auto w-12 h-12 rounded-full bg-white shadow-lg border border-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all ${currentIndex === queue.length - 1 ? 'opacity-0' : 'opacity-100'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
          </div>

          <div 
            className="bg-white w-full max-w-2xl aspect-[4/3] md:aspect-[16/10] rounded-3xl shadow-2xl border border-slate-200 flex flex-col items-center justify-center text-center p-8 md:p-12 relative cursor-pointer hover:shadow-indigo-100 transition-all duration-300 select-none"
            onClick={() => setIsFlipped(prev => !prev)}
          >
                {/* FRONT CONTENT */}
                <div className={`transition-all duration-500 absolute inset-0 flex flex-col items-center justify-center p-8 ${isFlipped ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'}`}>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-6 block">Thuật ngữ</span>
                    <h2 className="text-4xl md:text-6xl font-serif font-medium text-slate-900 leading-tight mb-4 selection:bg-indigo-100">
                        {currentCard.term}
                    </h2>
                    <button 
                        onClick={(e) => { e.stopPropagation(); playAudio(currentCard.term); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-sm transition-colors mt-2"
                    >
                        🔊 Nghe phát âm
                    </button>
                </div>

                {/* BACK CONTENT (REVEAL) */}
                <div className={`transition-all duration-500 absolute inset-0 flex flex-col items-center justify-center p-8 bg-white rounded-3xl ${isFlipped ? 'opacity-100 scale-100 z-10' : 'opacity-0 pointer-events-none scale-90'}`}>
                    <div className="w-16 h-1 bg-slate-200 rounded-full mb-6 absolute top-8"></div>
                    
                    {currentCard.phonetic && (
                        <div className="mb-4 font-mono text-slate-500 text-lg">/{currentCard.phonetic}/</div>
                    )}
                    
                    <div className="text-2xl md:text-3xl font-bold text-slate-800 mb-6 max-w-lg leading-snug">
                        {currentCard.meaning}
                    </div>

                    {currentCard.explanation && (
                        <div className="bg-slate-50 p-4 rounded-xl text-slate-600 text-sm md:text-base max-w-lg border border-slate-100 italic">
                            "{currentCard.explanation}"
                        </div>
                    )}
                </div>
                
                {/* HINT */}
                <div className="absolute bottom-6 text-slate-300 text-xs font-bold uppercase tracking-widest">
                    {isFlipped ? 'Nhấn Space để xem lại từ' : 'Nhấn Space để lật'}
                </div>
          </div>
      </div>

      {/* CONTROLS BAR */}
      <div className="bg-white border-t border-slate-200 p-4 md:p-6 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
          <div className="max-w-4xl mx-auto">
              {!isFlipped ? (
                  <button 
                    onClick={() => setIsFlipped(true)}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl text-lg shadow-lg hover:bg-slate-800 hover:scale-[1.01] transition-all active:scale-95"
                  >
                      Hiện đáp án <span className="ml-2 opacity-50 text-sm font-normal">(Space)</span>
                  </button>
              ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                      <ReviewButton 
                        label="Học lại" subLabel={getIntervalPreviewText(currentCard, 'again')} 
                        color="bg-red-50 text-red-600 border-red-100 hover:bg-red-100 hover:border-red-200" 
                        shortcut="1"
                        onClick={() => handleRate('again')} 
                      />
                      <ReviewButton 
                        label="Khó" subLabel={getIntervalPreviewText(currentCard, 'hard')} 
                        color="bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100 hover:border-orange-200" 
                        shortcut="2"
                        onClick={() => handleRate('hard')} 
                      />
                      <ReviewButton 
                        label="Tốt" subLabel={getIntervalPreviewText(currentCard, 'good')} 
                        color="bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100 hover:border-blue-200" 
                        shortcut="3"
                        onClick={() => handleRate('good')} 
                      />
                      <ReviewButton 
                        label="Dễ" subLabel={getIntervalPreviewText(currentCard, 'easy')} 
                        color="bg-green-50 text-green-600 border-green-100 hover:bg-green-100 hover:border-green-200" 
                        shortcut="4"
                        onClick={() => handleRate('easy')} 
                      />
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

const ReviewButton = ({ label, subLabel, color, onClick, shortcut }: any) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center py-3 md:py-4 rounded-2xl border-2 transition-all active:scale-95 ${color}`}
    >
        <span className="text-[10px] uppercase font-bold opacity-60 mb-0.5 tracking-wider">{subLabel}</span>
        <span className="text-lg font-black">{label}</span>
        <span className="text-[10px] mt-1 opacity-40 font-mono border border-current px-1.5 rounded bg-white/50">{shortcut}</span>
    </button>
);
