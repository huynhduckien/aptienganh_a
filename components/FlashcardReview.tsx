
import React, { useState, useEffect } from 'react';
import { Flashcard, ReviewRating, AnkiStats } from '../types';
import { updateCardStatus, getAnkiStats, setDailyLimit, importFlashcardsFromSheet, getIntervalPreviewText } from '../services/flashcardService';

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
  const [stats, setStats] = useState<AnkiStats | null>(null);
  
  // Settings
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState('50');

  // Import State
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState('');

  // Chart Filters
  const [forecastRange, setForecastRange] = useState<'1m' | '3m' | '1y'>('1m');

  useEffect(() => {
    refreshStats();
    setQueue(dueCards);
  }, [dueCards]);

  const refreshStats = async () => {
      const s = await getAnkiStats();
      setStats(s);
      if(s) setTempLimit(s.today.limit.toString());
  };

  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        
        // 1. Chinese (Hanzi detection)
        if (/[\u4e00-\u9fa5]/.test(text)) {
            utterance.lang = 'zh-CN';
        }
        // 2. French (Common accents detection)
        else if (/[éàèùâêîôûëïüÿçœæ]/i.test(text)) {
            utterance.lang = 'fr-FR';
        }
        // 3. Default English
        else {
            utterance.lang = 'en-US';
        }

        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
  };

  const handleRate = async (rating: ReviewRating) => {
    const currentCard = queue[currentIndex];
    await updateCardStatus(currentCard.id, rating);
    
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

  const handleImportSheet = async () => {
      if (!importUrl) return;
      setImportStatus('loading');
      setImportMsg('Đang tải dữ liệu...');
      
      const result = await importFlashcardsFromSheet(importUrl);
      
      if (result.error) {
          setImportStatus('error');
          setImportMsg(result.error);
      } else {
          setImportStatus('success');
          setImportMsg(`Thành công! Đã thêm ${result.added} thẻ mới (Tổng: ${result.total}).`);
          setImportUrl('');
          refreshStats();
          onUpdate();
      }
  };

  // --- CHART COMPONENTS (CSS ONLY) ---

  const SimpleBarChart = ({ data, labels, color = 'bg-slate-300' }: { data: number[], labels: string[], color?: string }) => {
      const max = Math.max(...data, 1);
      return (
          <div className="flex items-end justify-between h-32 gap-0.5 md:gap-1 pt-4 w-full overflow-hidden">
              {data.map((val, idx) => {
                   return (
                      <div key={idx} className="flex-1 flex flex-col items-center group relative min-w-[2px]">
                          <div 
                              className={`w-full ${color} rounded-t-sm hover:brightness-90 transition-all`}
                              style={{ height: `${(val / max) * 100}%` }}
                          ></div>
                          {/* Label every X items */}
                          {(data.length <= 7 || idx % 5 === 0) && (
                              <span className="text-[8px] md:text-[9px] text-slate-400 mt-1 absolute top-full whitespace-nowrap">{labels[idx]}</span>
                          )}
                      </div>
                   )
              })}
          </div>
      )
  };

  // NEW: Stacked Bar Chart for Forecast (Anki Style)
  const StackedForecastChart = ({ young, mature, labels }: { young: number[], mature: number[], labels: string[] }) => {
      // Calculate local max for the current view slice to scale bars properly
      let localMax = 0;
      for (let i = 0; i < young.length; i++) {
          const total = young[i] + mature[i];
          if (total > localMax) localMax = total;
      }
      const safeMax = Math.max(localMax, 1);
      
      // Dynamic label interval based on data length
      const labelInterval = Math.ceil(young.length / 7);

      return (
        <div className="flex items-end justify-between h-32 gap-0.5 md:gap-px pt-4 w-full overflow-hidden relative">
            {/* Y-Axis Grid lines (Optional, simple) */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                <div className="border-t border-slate-900 w-full"></div>
                <div className="border-t border-slate-900 w-full"></div>
                <div className="border-t border-slate-900 w-full"></div>
            </div>

            {young.map((yVal, idx) => {
                 const mVal = mature[idx];
                 const total = yVal + mVal;
                 const heightPercent = (total / safeMax) * 100;
                 
                 const youngHeightPercent = total > 0 ? (yVal / total) * 100 : 0;
                 const matureHeightPercent = total > 0 ? (mVal / total) * 100 : 0;

                 return (
                    <div key={idx} className="flex-1 flex flex-col justify-end items-center group relative min-w-[1px] h-full">
                        <div className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden hover:brightness-90 transition-all" style={{ height: `${heightPercent}%` }}>
                            {/* Mature (Bottom) */}
                            <div className="w-full bg-emerald-700" style={{ height: `${matureHeightPercent}%` }} title={`Mature: ${mVal}`}></div>
                            {/* Young (Top) */}
                            <div className="w-full bg-lime-400" style={{ height: `${youngHeightPercent}%` }} title={`Young: ${yVal}`}></div>
                        </div>
                        
                        {(idx % labelInterval === 0) && (
                            <span className="text-[8px] md:text-[9px] text-slate-400 mt-1 absolute top-full whitespace-nowrap">{labels[idx]}</span>
                        )}
                    </div>
                 )
            })}
        </div>
      );
  };

  const DonutChart = ({ counts }: { counts: AnkiStats['counts'] }) => {
      const total = Math.max(counts.total, 1);
      
      // Calculate degrees
      const pNew = (counts.new / total) * 360;
      const pLearning = (counts.learning / total) * 360;
      const pYoung = (counts.young / total) * 360;
      const pMature = (counts.mature / total) * 360;

      const gradient = `conic-gradient(
          #3b82f6 0deg ${pNew}deg, 
          #f97316 ${pNew}deg ${pNew + pLearning}deg,
          #a3e635 ${pNew + pLearning}deg ${pNew + pLearning + pYoung}deg,
          #047857 ${pNew + pLearning + pYoung}deg 360deg
      )`;

      return (
          <div className="flex flex-col md:flex-row items-center gap-6">
               <div className="relative w-32 h-32 shrink-0 rounded-full" style={{ background: gradient }}>
                   <div className="absolute inset-8 bg-white rounded-full flex items-center justify-center">
                       <div className="text-center">
                           <div className="text-xs text-slate-400 font-bold">Total</div>
                           <div className="text-xl font-bold text-slate-800">{counts.total}</div>
                       </div>
                   </div>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-1 text-xs font-medium">
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> New: {counts.new}</div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-500 rounded-sm"></div> Learning: {counts.learning}</div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-lime-400 rounded-sm"></div> Young: {counts.young}</div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-700 rounded-sm"></div> Mature: {counts.mature}</div>
               </div>
          </div>
      )
  };

  // --- MAIN RENDER ---

  if (view === 'overview') {
      const forecastSlice = forecastRange === '1m' ? 30 : forecastRange === '3m' ? 90 : 365;

      return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col md:block overflow-hidden md:overflow-y-auto md:p-4">
             {/* Mobile Header */}
             <div className="md:hidden bg-white p-4 border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                 <h2 className="text-lg font-bold text-slate-800">Thống kê</h2>
                 <button onClick={onClose} className="text-slate-500 font-bold p-2">✕</button>
             </div>

             <div className="w-full max-w-6xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-10 p-4 md:p-0 overflow-y-auto h-full md:h-auto">
                 
                 {/* Desktop Header */}
                 <div className="hidden md:flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                     <h2 className="text-xl font-bold text-slate-800">Thống kê & Ôn tập</h2>
                     <button onClick={onClose} className="text-slate-500 hover:text-slate-800 font-bold px-4">Đóng</button>
                 </div>

                 {stats ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                         
                         {/* CARD: HÔM NAY */}
                         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
                             <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Hôm nay</h3>
                             <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                                 {queue.length > 0 ? (
                                     <>
                                        <p className="text-slate-500 text-sm">Bạn có <strong className="text-slate-900">{queue.length}</strong> thẻ cần ôn tập ngay.</p>
                                        <button 
                                            onClick={() => setView('review')}
                                            className="w-full md:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95"
                                        >
                                            Bắt đầu học ngay
                                        </button>
                                     </>
                                 ) : (
                                     <p className="text-slate-400">Không có thẻ nào cần học hôm nay.</p>
                                 )}
                                 
                                 <div className="mt-4 pt-4 border-t w-full text-xs text-slate-500 flex justify-between px-2">
                                     <span>Đã học: {stats.today.studied}</span>
                                     <span>Học lại: {stats.today.againCount}</span>
                                     <span>Thuộc: {stats.today.matureCount}</span>
                                 </div>
                             </div>
                         </div>

                         {/* CARD: DỰ BÁO (Updated Anki Style) */}
                         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
                             <div className="flex justify-between items-center mb-4 border-b pb-2">
                                <h3 className="text-lg font-semibold text-slate-800">Dự báo</h3>
                                <div className="space-x-2 text-[10px]">
                                    <label className="cursor-pointer"><input type="radio" checked={forecastRange==='1m'} onChange={()=>setForecastRange('1m')} className="mr-1"/>1 tháng</label>
                                    <label className="cursor-pointer"><input type="radio" checked={forecastRange==='3m'} onChange={()=>setForecastRange('3m')} className="mr-1"/>3 tháng</label>
                                    <label className="cursor-pointer"><input type="radio" checked={forecastRange==='1y'} onChange={()=>setForecastRange('1y')} className="mr-1"/>1 năm</label>
                                </div>
                             </div>
                             <div className="flex-1 w-full overflow-hidden relative">
                                 <div className="text-center text-xs text-slate-500 mb-2">Số thẻ ôn tập đến hạn trong tương lai.</div>
                                 
                                 <div className="absolute top-0 right-0 flex gap-3 text-[10px]">
                                     <div className="flex items-center gap-1"><div className="w-2 h-2 bg-lime-400"></div>Young</div>
                                     <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-700"></div>Mature</div>
                                 </div>

                                 <StackedForecastChart 
                                    young={stats.forecast.young.slice(0, forecastSlice)} 
                                    mature={stats.forecast.mature.slice(0, forecastSlice)}
                                    labels={stats.forecast.labels.slice(0, forecastSlice)} 
                                 />
                             </div>
                         </div>

                         {/* CARD: SỐ LƯỢNG THẺ */}
                         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
                             <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Số lượng thẻ</h3>
                             <div className="flex-1 flex justify-center items-center">
                                 <DonutChart counts={stats.counts} />
                             </div>
                         </div>

                         {/* CARD: KHOẢNG CÁCH */}
                         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
                             <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Khoảng cách</h3>
                             <div className="flex-1 w-full overflow-hidden">
                                 <div className="text-center text-xs text-slate-500 mb-2">Thời gian giãn cách</div>
                                 <SimpleBarChart 
                                    data={stats.intervals.data} 
                                    labels={stats.intervals.labels}
                                    color="bg-slate-400"
                                 />
                             </div>
                         </div>

                         {/* CARD: SETTINGS & IMPORT */}
                         <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-600">Giới hạn học/ngày</span>
                                <div className="flex items-center gap-2">
                                    {isEditingLimit ? (
                                        <>
                                            <input 
                                                type="number" 
                                                value={tempLimit} 
                                                onChange={(e) => setTempLimit(e.target.value)}
                                                className="w-16 px-2 py-1 border rounded text-center"
                                            />
                                            <button onClick={handleSaveLimit} className="text-green-600 font-bold text-sm bg-green-100 px-2 py-1 rounded">Lưu</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setIsEditingLimit(true)} className="text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded">
                                            {stats.today.limit} thẻ ✏️
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                {!showImport ? (
                                    <button 
                                        onClick={() => setShowImport(true)}
                                        className="w-full flex items-center justify-center gap-2 text-indigo-600 font-bold text-sm hover:underline"
                                    >
                                        📥 Import Google Sheet
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        <input 
                                            type="text"
                                            placeholder="Link Google Sheet..."
                                            value={importUrl}
                                            onChange={(e) => setImportUrl(e.target.value)}
                                            className="w-full px-3 py-2 text-xs border rounded"
                                        />
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={handleImportSheet}
                                                disabled={importStatus === 'loading'}
                                                className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs rounded font-bold disabled:opacity-50"
                                            >
                                                {importStatus === 'loading' ? '...' : 'Import'}
                                            </button>
                                            <button onClick={() => setShowImport(false)} className="px-3 py-2 text-xs text-slate-500 bg-white border rounded">Hủy</button>
                                        </div>
                                        {importMsg && (
                                            <div className={`text-xs p-2 rounded ${importStatus === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                {importMsg}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                         </div>

                     </div>
                 ) : (
                     <div className="text-center py-20 text-slate-400">Đang tải dữ liệu...</div>
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
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Hoàn thành!</h2>
                <p className="text-slate-500 mb-8">Bạn đã ôn tập {queue.length} thẻ. Hãy quay lại sau nhé.</p>
                <button 
                    onClick={onClose}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700"
                >
                    Đóng
                </button>
            </div>
        </div>
      );
  }

  // REVIEW MODE - RESPONSIVE LAYOUT
  const currentCard = queue[currentIndex];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 sm:p-4 h-[100dvh]">
      <div className="w-full max-w-2xl mx-auto h-full flex flex-col bg-white sm:rounded-2xl shadow-xl overflow-hidden">
        
        {/* Top Bar */}
        <div className="flex justify-between items-center bg-slate-50 p-4 border-b border-slate-200 shrink-0">
            <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Review</span>
                <span className="font-mono text-sm text-slate-700 font-bold">{currentIndex + 1} / {queue.length}</span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-2 text-xl font-bold px-4">✕</button>
        </div>

        {/* Card Area - Flex Grow to fill space */}
        <div 
            className="flex-1 relative overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-center text-center cursor-pointer select-none" 
            onClick={() => setIsFlipped(!isFlipped)}
        >
            
            <div className="mb-6 md:mb-10 w-full">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-4">Từ vựng</span>
                 <h2 className="text-4xl md:text-6xl font-serif font-bold text-slate-900 mb-4 break-words leading-tight">{currentCard.term}</h2>
                 
                 <div className="flex items-center justify-center gap-3">
                     {currentCard.phonetic && (
                        <span className="text-slate-500 font-mono text-lg md:text-2xl bg-slate-50 px-3 py-1 rounded-lg">
                            /{currentCard.phonetic}/
                        </span>
                     )}
                     <button 
                            onClick={(e) => { e.stopPropagation(); playAudio(currentCard.term); }}
                            className="text-indigo-500 hover:text-indigo-700 p-2 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    </button>
                 </div>
            </div>

            {isFlipped ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full max-w-lg border-t pt-6 md:pt-8 border-slate-100">
                     <div className="mb-6">
                        <span className="text-xs font-bold text-green-600 uppercase tracking-widest block mb-2">Nghĩa</span>
                        <p className="text-2xl md:text-3xl font-bold text-slate-800">{currentCard.meaning}</p>
                     </div>
                     
                     <div className="bg-indigo-50/50 p-4 md:p-6 rounded-xl text-left border border-indigo-50">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block mb-2">Ngữ cảnh / Ghi chú</span>
                        <p className="text-slate-700 leading-relaxed text-sm md:text-base">{currentCard.explanation || "Không có giải thích"}</p>
                     </div>
                </div>
            ) : (
                <div className="absolute bottom-10 text-slate-400 animate-bounce">
                    chạm để lật
                </div>
            )}
        </div>

        {/* Action Bar */}
        <div className="p-2 md:p-4 bg-white border-t border-slate-200 shrink-0">
            {!isFlipped ? (
                <button 
                    onClick={() => setIsFlipped(true)}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl text-lg hover:bg-slate-800 transition-all active:scale-95"
                >
                    Hiện đáp án
                </button>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                    <button 
                        onClick={() => handleRate('again')}
                        className="flex flex-col items-center justify-center py-3 bg-red-50 text-red-700 rounded-xl border border-red-100 hover:bg-red-100 transition-all active:scale-95"
                    >
                        <span className="text-[10px] font-bold opacity-60 mb-1">{getIntervalPreviewText(currentCard, 'again')}</span>
                        <span className="font-bold">Again</span>
                    </button>
                    <button 
                        onClick={() => handleRate('hard')}
                        className="flex flex-col items-center justify-center py-3 bg-orange-50 text-orange-700 rounded-xl border border-orange-100 hover:bg-orange-100 transition-all active:scale-95"
                    >
                        <span className="text-[10px] font-bold opacity-60 mb-1">{getIntervalPreviewText(currentCard, 'hard')}</span>
                        <span className="font-bold">Hard</span>
                    </button>
                    <button 
                        onClick={() => handleRate('good')}
                        className="flex flex-col items-center justify-center py-3 bg-green-50 text-green-700 rounded-xl border border-green-100 hover:bg-green-100 transition-all active:scale-95"
                    >
                        <span className="text-[10px] font-bold opacity-60 mb-1">{getIntervalPreviewText(currentCard, 'good')}</span>
                        <span className="font-bold">Good</span>
                    </button>
                    <button 
                        onClick={() => handleRate('easy')}
                        className="flex flex-col items-center justify-center py-3 bg-sky-50 text-sky-700 rounded-xl border border-sky-100 hover:bg-sky-100 transition-all active:scale-95"
                    >
                        <span className="text-[10px] font-bold opacity-60 mb-1">{getIntervalPreviewText(currentCard, 'easy')}</span>
                        <span className="font-bold">Easy</span>
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
