

import React, { useState, useEffect } from 'react';
import { Flashcard, ReviewRating } from '../types';
import { updateCardStatus, getFlashcardStats, FlashcardStats, getStudyHistoryChart, ChartData, setDailyLimit } from '../services/flashcardService';

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
  
  // Charts & Settings
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartRange, setChartRange] = useState<'week' | 'month' | 'year'>('week');
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState('50');

  // Session stats
  const [sessionCorrect, setSessionCorrect] = useState(0);

  useEffect(() => {
    refreshStats();
    setQueue(dueCards);
  }, [dueCards]);

  useEffect(() => {
      // Re-fetch chart when range changes
      getStudyHistoryChart(chartRange).then(setChartData);
  }, [chartRange]);

  const refreshStats = async () => {
      const s = await getFlashcardStats();
      setStats(s);
      setTempLimit(s.dailyLimit.toString());
      const c = await getStudyHistoryChart(chartRange);
      setChartData(c);
  };

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

  const handleSaveLimit = () => {
      const val = parseInt(tempLimit);
      if (val > 0) {
          setDailyLimit(val);
          setIsEditingLimit(false);
          refreshStats();
          onUpdate(); // Re-fetch due cards
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
             <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl p-6 md:p-8 animate-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
                 <div className="flex justify-between items-center mb-6">
                     <h2 className="text-2xl font-bold text-slate-800">Thống kê học tập</h2>
                     <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 text-xl">✕</button>
                 </div>

                 {stats ? (
                     <div className="space-y-6">
                         
                         {/* Daily Limit Status */}
                         <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                             <div className="flex justify-between items-end mb-2">
                                 <div>
                                     <h3 className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
                                         Tiến độ Hôm nay
                                         {isEditingLimit ? (
                                             <div className="flex items-center gap-2 ml-2">
                                                <input 
                                                    type="number" 
                                                    value={tempLimit} 
                                                    onChange={(e)=>setTempLimit(e.target.value)} 
                                                    className="w-16 px-2 py-1 text-sm border rounded"
                                                />
                                                <button onClick={handleSaveLimit} className="text-green-600 text-xs font-bold">Lưu</button>
                                             </div>
                                         ) : (
                                             <button onClick={() => setIsEditingLimit(true)} className="text-indigo-500 text-xs hover:underline" title="Chỉnh giới hạn">
                                                 (Giới hạn: {stats.dailyLimit}) 🖊️
                                             </button>
                                         )}
                                     </h3>
                                     <div className="text-3xl font-black text-slate-800">
                                         {stats.studiedToday} <span className="text-lg text-slate-400 font-medium">/ {stats.dailyLimit} thẻ</span>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     {stats.backlog > 0 && (
                                         <div className="flex flex-col items-end animate-pulse">
                                             <div className="text-red-500 font-bold text-sm bg-red-50 px-3 py-1 rounded-full border border-red-100 mb-1">
                                                 ⚠️ Nợ bài: {stats.backlog} thẻ
                                             </div>
                                             <span className="text-[10px] text-red-400">Bạn đã bỏ lỡ bài ôn tập</span>
                                         </div>
                                     )}
                                 </div>
                             </div>
                             <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                                 <div 
                                    className={`h-full rounded-full transition-all ${stats.studiedToday >= stats.dailyLimit ? 'bg-green-500' : 'bg-indigo-500'}`}
                                    style={{ width: `${Math.min(100, (stats.studiedToday / stats.dailyLimit) * 100)}%` }}
                                 ></div>
                             </div>
                         </div>

                         {/* Chart Section */}
                         {chartData && (
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase">Biểu đồ ôn tập</h3>
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        {(['week', 'month', 'year'] as const).map(r => (
                                            <button 
                                                key={r}
                                                onClick={() => setChartRange(r)}
                                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${chartRange === r ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                {r === 'week' ? 'Tuần' : r === 'month' ? 'Tháng' : 'Năm'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-end justify-between h-40 gap-1 pb-2 overflow-x-auto">
                                    {chartData.values.map((val, idx) => {
                                        const max = Math.max(...chartData.values, 5); // Scale
                                        const height = (val / max) * 100;
                                        return (
                                            <div key={idx} className="flex-1 min-w-[20px] flex flex-col items-center group">
                                                <div className="relative w-full flex justify-center items-end h-full">
                                                    <div 
                                                        className="w-full mx-0.5 bg-indigo-100 rounded-t-sm group-hover:bg-indigo-300 transition-colors relative"
                                                        style={{ height: `${Math.max(2, height)}%` }}
                                                    >
                                                        {val > 0 && (
                                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-0.5 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                                                                {val} thẻ
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Only show label for every nth item if too many */}
                                                {(chartRange === 'week' || chartRange === 'year' || idx % 5 === 0) && (
                                                     <span className="text-[9px] text-slate-400 font-bold mt-2 uppercase truncate w-full text-center">{chartData.labels[idx]}</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                         )}

                         <div className="grid grid-cols-2 gap-4">
                             <div className="bg-red-50 p-5 rounded-2xl border border-red-100 text-center relative overflow-hidden">
                                 <div className="text-3xl font-black text-red-600 mb-1">{queue.length}</div>
                                 <div className="text-xs font-bold text-red-400 uppercase tracking-wider">Cần ôn bây giờ</div>
                             </div>
                             <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 text-center">
                                 <div className="text-3xl font-black text-emerald-600 mb-1">{stats.mastered}</div>
                                 <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Đã thuộc lòng</div>
                             </div>
                         </div>
                     </div>
                 ) : (
                     <div className="text-center py-10">Đang tải thống kê...</div>
                 )}

                 <button 
                    onClick={() => setView(queue.length > 0 ? 'review' : 'overview')}
                    disabled={queue.length === 0}
                    className="w-full mt-6 py-4 bg-slate-900 text-white font-bold text-lg rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-300 transition-all active:scale-95 flex items-center justify-center gap-2"
                 >
                    {stats && stats.studiedToday >= stats.dailyLimit && queue.length > 0 ? (
                        <><span>⚠️</span> Vượt chỉ tiêu ngày ({queue.length} thẻ)</>
                    ) : (
                        queue.length > 0 ? `Bắt đầu ôn tập (${queue.length} thẻ)` : 'Không có thẻ nào cần ôn'
                    )}
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
