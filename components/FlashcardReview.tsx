

import React, { useState, useEffect } from 'react';
import { Flashcard, ReviewRating, ChartDataPoint } from '../types';
import { updateCardStatus, getFlashcardStats, FlashcardStats, getStudyHistoryChart, setDailyLimit } from '../services/flashcardService';

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
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
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
      if (days < 1) return "1d"; 
      if (days < 30) return `${days}d`;
      if (days < 365) return `${Math.round(days/30)}mo`;
      return `${(days/365).toFixed(1)}y`;
  };

  // Pre-calculate next intervals for button labels
  const getIntervalPreview = (rating: ReviewRating) => {
      const card = queue[currentIndex];
      if (!card) return "";
      
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
             <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl p-6 md:p-8 animate-in zoom-in duration-300 overflow-y-auto max-h-[95vh]">
                 <div className="flex justify-between items-center mb-6">
                     <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="text-3xl">📊</span> Thống kê học tập
                     </h2>
                     <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 text-xl">✕</button>
                 </div>

                 {stats ? (
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         
                         {/* LEFT COLUMN: Daily Status & Big Stats */}
                         <div className="space-y-6">
                             {/* Daily Limit */}
                             <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                <div className="flex justify-between items-center mb-4">
                                     <h3 className="text-xs font-bold text-slate-500 uppercase">Hôm nay</h3>
                                     {isEditingLimit ? (
                                         <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                value={tempLimit} 
                                                onChange={(e)=>setTempLimit(e.target.value)} 
                                                className="w-14 px-1 py-0.5 text-sm border rounded"
                                            />
                                            <button onClick={handleSaveLimit} className="text-green-600 text-xs font-bold">Lưu</button>
                                         </div>
                                     ) : (
                                         <button onClick={() => setIsEditingLimit(true)} className="text-slate-400 text-[10px] hover:text-indigo-500 hover:underline">
                                             Giới hạn: {stats.dailyLimit} 🖊️
                                         </button>
                                     )}
                                </div>
                                
                                <div className="text-4xl font-black text-slate-800 mb-2">
                                    {stats.studiedToday} <span className="text-sm font-medium text-slate-400">/ {stats.dailyLimit}</span>
                                </div>
                                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-4">
                                    <div 
                                        className={`h-full rounded-full transition-all ${stats.studiedToday >= stats.dailyLimit ? 'bg-green-500' : 'bg-indigo-500'}`}
                                        style={{ width: `${Math.min(100, (stats.studiedToday / stats.dailyLimit) * 100)}%` }}
                                    ></div>
                                </div>

                                {stats.backlog > 0 && (
                                    <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs font-bold border border-red-100 flex items-center gap-2">
                                        <span>⚠️</span> Nợ bài: {stats.backlog} thẻ
                                    </div>
                                )}
                             </div>

                             {/* Start Button */}
                             <button 
                                onClick={() => setView(queue.length > 0 ? 'review' : 'overview')}
                                disabled={queue.length === 0}
                                className="w-full py-4 bg-slate-900 text-white font-bold text-lg rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                             >
                                {stats.studiedToday >= stats.dailyLimit && queue.length > 0 ? (
                                    <><span>💪</span> Học vượt chỉ tiêu ({queue.length})</>
                                ) : (
                                    queue.length > 0 ? `Bắt đầu ôn tập (${queue.length})` : 'Đã hoàn thành!'
                                )}
                             </button>

                             {/* Small Stats Grid */}
                             <div className="grid grid-cols-2 gap-3">
                                 <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                     <div className="text-2xl font-black text-emerald-600">{stats.mastered}</div>
                                     <div className="text-[10px] font-bold text-emerald-800 uppercase">Thuộc lòng</div>
                                 </div>
                                 <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                     <div className="text-2xl font-black text-blue-600">{stats.learning}</div>
                                     <div className="text-[10px] font-bold text-blue-800 uppercase">Đang học</div>
                                 </div>
                             </div>
                         </div>

                         {/* RIGHT COLUMN: Chart (Spanning 2 cols) */}
                         <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Lịch sử ôn tập</h3>
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

                            {/* ANKI STYLE CHART */}
                            <div className="flex-1 min-h-[200px] flex items-end gap-2 sm:gap-4 pb-2 border-b border-slate-200 relative">
                                {/* Grid lines background */}
                                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                                    <div className="w-full border-t border-slate-900"></div>
                                    <div className="w-full border-t border-slate-900"></div>
                                    <div className="w-full border-t border-slate-900"></div>
                                    <div className="w-full border-t border-slate-900"></div>
                                </div>

                                {chartData.length > 0 ? chartData.map((data, idx) => {
                                    // Scale based on max total
                                    const maxVal = Math.max(...chartData.map(d => d.total), 5);
                                    const heightPercent = (data.total / maxVal) * 100;

                                    // Segments height calculation
                                    const hAgain = (data.again / data.total) * 100;
                                    const hHard = (data.hard / data.total) * 100;
                                    const hGood = (data.good / data.total) * 100;
                                    const hEasy = (data.easy / data.total) * 100;

                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center group relative min-w-[15px]">
                                            {/* Tooltip */}
                                            <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] p-2 rounded pointer-events-none z-10 w-max shadow-lg">
                                                <div className="font-bold mb-1 border-b border-slate-600 pb-1">{data.label}</div>
                                                <div className="text-sky-300">Easy: {data.easy}</div>
                                                <div className="text-emerald-300">Good: {data.good}</div>
                                                <div className="text-orange-300">Hard: {data.hard}</div>
                                                <div className="text-rose-300">Again: {data.again}</div>
                                                <div className="mt-1 pt-1 border-t border-slate-600 font-bold">Total: {data.total}</div>
                                            </div>

                                            {/* Stacked Bar */}
                                            <div 
                                                className="w-full max-w-[30px] rounded-t-sm overflow-hidden flex flex-col-reverse relative bg-slate-100 hover:brightness-90 transition-all cursor-crosshair"
                                                style={{ height: `${Math.max(2, heightPercent)}%` }}
                                            >
                                                {/* Easy (Blue) */}
                                                {data.easy > 0 && <div style={{ height: `${hEasy}%` }} className="bg-sky-500 w-full"></div>}
                                                {/* Good (Green) */}
                                                {data.good > 0 && <div style={{ height: `${hGood}%` }} className="bg-emerald-500 w-full"></div>}
                                                {/* Hard (Orange) */}
                                                {data.hard > 0 && <div style={{ height: `${hHard}%` }} className="bg-orange-400 w-full"></div>}
                                                {/* Again (Red) */}
                                                {data.again > 0 && <div style={{ height: `${hAgain}%` }} className="bg-rose-500 w-full"></div>}
                                            </div>
                                            
                                            {/* Label */}
                                            {(chartRange === 'week' || chartRange === 'year' || idx % 5 === 0) && (
                                                <span className="text-[10px] text-slate-400 font-bold mt-2 rotate-0 truncate w-full text-center">{data.label}</span>
                                            )}
                                        </div>
                                    );
                                }) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">Chưa có dữ liệu học tập</div>
                                )}
                            </div>
                            
                            {/* Legend */}
                            <div className="flex gap-4 justify-center mt-4">
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-rose-500 rounded-sm"></div><span className="text-[10px] font-bold text-slate-500">Again</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-400 rounded-sm"></div><span className="text-[10px] font-bold text-slate-500">Hard</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div><span className="text-[10px] font-bold text-slate-500">Good</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-sky-500 rounded-sm"></div><span className="text-[10px] font-bold text-slate-500">Easy</span></div>
                            </div>
                         </div>
                     </div>
                 ) : (
                     <div className="text-center py-10">Đang tải thống kê...</div>
                 )}
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
        
        {/* Spacer for non-flipped state */}
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