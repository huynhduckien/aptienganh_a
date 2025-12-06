
import React, { useState, useEffect } from 'react';
import { Flashcard, ReviewRating, AnkiStats } from '../types';
import { updateCardStatus, getAnkiStats, setDailyLimit, importFlashcardsFromSheet, getIntervalPreviewText, getForgottenCardsToday } from '../services/flashcardService';

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

  // Forgotten List State
  const [showForgotten, setShowForgotten] = useState(false);
  const [forgottenList, setForgottenList] = useState<Flashcard[]>([]);

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

  const handleShowForgotten = async () => {
      const cards = await getForgottenCardsToday();
      setForgottenList(cards);
      setShowForgotten(true);
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

  // UPDATED: Stacked Bar Chart for Forecast (Anki Style with Fixed X-Axis)
  const StackedForecastChart = ({ young, mature, labels }: { young: number[], mature: number[], labels: string[] }) => {
      // Calculate local max
      let localMax = 0;
      for (let i = 0; i < young.length; i++) {
          const total = young[i] + mature[i];
          if (total > localMax) localMax = total;
      }
      const safeMax = Math.max(localMax, 5); 
      
      // Determine ticks for X-Axis (show exactly 6 ticks evenly distributed)
      const tickCount = 6;
      const ticks = [];
      for (let i = 0; i < tickCount; i++) {
          const index = Math.floor((i / (tickCount - 1)) * (young.length - 1));
          ticks.push({
              label: labels[index] || '',
              left: `${(i / (tickCount - 1)) * 100}%`
          });
      }

      return (
        <div className="relative w-full h-56 pt-6 pb-8 pl-10 pr-4 box-border">
            {/* Y-Axis Labels (Left) */}
            <div className="absolute left-0 top-6 bottom-8 w-8 flex flex-col justify-between text-[10px] text-slate-400 text-right pr-2 font-mono">
                <span>{safeMax}</span>
                <span>{Math.round(safeMax / 2)}</span>
                <span>0</span>
            </div>

            {/* Grid lines (Background) */}
            <div className="absolute left-10 right-4 top-6 bottom-8 flex flex-col justify-between pointer-events-none z-0">
                <div className="border-t border-slate-100 w-full h-0"></div>
                <div className="border-t border-slate-100 w-full h-0 border-dashed"></div>
                <div className="border-b border-slate-300 w-full h-0"></div>
            </div>

            {/* Bars Container */}
            <div className="flex items-end justify-between h-full w-full relative z-10 gap-[1px]">
                {young.map((yVal, idx) => {
                    const mVal = mature[idx];
                    const total = yVal + mVal;
                    const heightPercent = (total / safeMax) * 100;
                    
                    const youngHeightPercent = total > 0 ? (yVal / total) * 100 : 0;
                    const matureHeightPercent = total > 0 ? (mVal / total) * 100 : 0;

                    return (
                        <div key={idx} className="flex-1 flex flex-col justify-end items-center group relative min-w-[2px] h-full">
                            {/* Hover Tooltip */}
                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-20 whitespace-nowrap transition-opacity shadow-lg">
                                Day {labels[idx]}: <span className="font-bold">{total}</span> (Y:{yVal}, M:{mVal})
                            </div>

                            {/* The Bar */}
                            <div 
                                className="w-full flex flex-col-reverse rounded-t-[2px] overflow-hidden hover:opacity-80 transition-opacity cursor-crosshair" 
                                style={{ height: `${heightPercent}%` }}
                            >
                                {/* Mature (Bottom - Dark Green - Anki Style) */}
                                <div className="w-full bg-[#15803d]" style={{ height: `${matureHeightPercent}%` }}></div>
                                {/* Young (Top - Light Green - Anki Style) */}
                                <div className="w-full bg-[#a3e635]" style={{ height: `${youngHeightPercent}%` }}></div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* X-Axis Labels (Absolute Positioning) */}
            <div className="absolute left-10 right-4 bottom-0 h-6">
                {ticks.map((tick, i) => (
                    <div 
                        key={i} 
                        className="absolute top-0 text-[10px] text-slate-500 transform -translate-x-1/2 text-center font-medium"
                        style={{ left: tick.left }}
                    >
                        {tick.label}
                    </div>
                ))}
            </div>
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
          #15803d ${pNew + pLearning + pYoung}deg 360deg
      )`;

      return (
          <div className="flex flex-col items-center justify-center p-4">
               <div className="relative w-40 h-40 shrink-0 rounded-full shadow-inner mb-6 ring-8 ring-slate-50" style={{ background: gradient }}>
                   <div className="absolute inset-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                       <div className="text-center">
                           <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tổng số</div>
                           <div className="text-3xl font-black text-slate-800">{counts.total}</div>
                       </div>
                   </div>
               </div>
               <div className="grid grid-cols-2 gap-x-8 gap-y-3 w-full max-w-xs text-xs font-medium">
                   <div className="flex items-center justify-between">
                       <span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> New</span>
                       <span className="font-bold">{counts.new}</span>
                   </div>
                   <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-orange-500 rounded-sm"></div> Learning</span>
                        <span className="font-bold">{counts.learning}</span>
                   </div>
                   <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-[#a3e635] rounded-sm"></div> Young</span>
                        <span className="font-bold">{counts.young}</span>
                   </div>
                   <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-[#15803d] rounded-sm"></div> Mature</span>
                        <span className="font-bold">{counts.mature}</span>
                   </div>
               </div>
          </div>
      )
  };

  // --- MAIN RENDER ---

  if (view === 'overview') {
      const forecastSlice = forecastRange === '1m' ? 30 : forecastRange === '3m' ? 90 : 365;

      return (
        <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col md:block overflow-hidden md:overflow-y-auto">
             
             {/* Sticky Header */}
             <div className="bg-white px-6 py-4 border-b border-slate-200 sticky top-0 z-20 shadow-sm flex justify-between items-center">
                 <div className="flex items-center gap-3">
                     <span className="bg-slate-900 text-white p-2 rounded-lg text-xl">📊</span>
                     <div>
                        <h2 className="text-xl font-bold text-slate-800">Bảng thống kê</h2>
                        <p className="text-xs text-slate-400 font-medium">Theo dõi tiến độ học tập hàng ngày</p>
                     </div>
                 </div>
                 <button 
                    onClick={onClose} 
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold transition-colors text-sm"
                 >
                    Đóng
                 </button>
             </div>

             <div className="w-full max-w-6xl mx-auto p-4 md:p-8 pb-24 md:pb-10 overflow-y-auto h-full md:h-auto">
                 
                 {stats ? (
                     <div className="space-y-6">
                         
                         {/* TOP ROW: TODAY & COUNTS */}
                         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                             
                             {/* 1. HÔM NAY (TODAY) - HERO CARD */}
                             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:col-span-2">
                                 <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                     <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                         <span>📅</span> Hôm nay
                                     </h3>
                                     <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tiến độ ngày</div>
                                 </div>
                                 
                                 <div className="p-8 flex-1 flex flex-col md:flex-row items-center justify-between gap-8">
                                     <div className="text-center md:text-left">
                                         {queue.length > 0 ? (
                                             <>
                                                 <div className="text-6xl font-black text-slate-900 mb-2">{queue.length}</div>
                                                 <div className="text-lg text-slate-500 font-medium mb-1">thẻ cần ôn tập ngay</div>
                                                 <p className="text-xs text-slate-400">Đừng để dồn bài nhé!</p>
                                             </>
                                         ) : (
                                             <>
                                                 <div className="text-5xl mb-2">🎉</div>
                                                 <div className="text-xl font-bold text-slate-800">Tuyệt vời!</div>
                                                 <div className="text-slate-500">Bạn đã hoàn thành mục tiêu hôm nay.</div>
                                             </>
                                         )}
                                     </div>

                                     <div className="flex-1 w-full max-w-sm space-y-4">
                                         {queue.length > 0 && (
                                            <button 
                                                onClick={() => setView('review')}
                                                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] transition-all active:scale-95 text-lg flex items-center justify-center gap-2"
                                            >
                                                <span>✍️</span> Bắt đầu học ngay
                                            </button>
                                         )}
                                         
                                         <div className="grid grid-cols-2 gap-4">
                                             <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                                                 <div className="text-2xl font-bold text-slate-700">{stats.today.studied}</div>
                                                 <div className="text-[10px] text-slate-400 uppercase font-bold">Đã học</div>
                                             </div>
                                             <div 
                                                 onClick={handleShowForgotten}
                                                 className="bg-red-50 p-3 rounded-xl border border-red-100 text-center cursor-pointer hover:bg-red-100 transition-colors"
                                             >
                                                 <div className="text-2xl font-bold text-red-600">{stats.today.againCount}</div>
                                                 <div className="text-[10px] text-red-400 uppercase font-bold">Quên bài (Xem lại)</div>
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>

                             {/* 2. PHÂN LOẠI (COUNTS) */}
                             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                 <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                     <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                         <span>📦</span> Kho thẻ
                                     </h3>
                                 </div>
                                 <div className="flex-1">
                                     <DonutChart counts={stats.counts} />
                                 </div>
                             </div>

                         </div>

                         {/* MIDDLE ROW: FORECAST */}
                         <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                             <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
                                 <div>
                                     <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                         <span>📈</span> Dự báo tương lai
                                     </h3>
                                     <p className="text-xs text-slate-500 mt-0.5">Số lượng thẻ sẽ đến hạn ôn tập trong thời gian tới</p>
                                 </div>
                                 
                                 <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                                     <button onClick={()=>setForecastRange('1m')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${forecastRange==='1m'?'bg-indigo-100 text-indigo-700':'text-slate-500 hover:bg-slate-50'}`}>1 tháng</button>
                                     <button onClick={()=>setForecastRange('3m')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${forecastRange==='3m'?'bg-indigo-100 text-indigo-700':'text-slate-500 hover:bg-slate-50'}`}>3 tháng</button>
                                     <button onClick={()=>setForecastRange('1y')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${forecastRange==='1y'?'bg-indigo-100 text-indigo-700':'text-slate-500 hover:bg-slate-50'}`}>1 năm</button>
                                 </div>
                             </div>
                             
                             <div className="p-2">
                                 <div className="flex justify-end gap-4 text-xs font-medium px-6 py-2">
                                     <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#a3e635]"></span>Young (Đang học)</div>
                                     <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#15803d]"></span>Mature (Đã thuộc)</div>
                                 </div>
                                 <StackedForecastChart 
                                    young={stats.forecast.young.slice(0, forecastSlice)} 
                                    mature={stats.forecast.mature.slice(0, forecastSlice)}
                                    labels={stats.forecast.labels.slice(0, forecastSlice)} 
                                 />
                             </div>
                         </div>

                         {/* BOTTOM ROW: INTERVALS & TOOLS */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             
                             {/* 3. KHOẢNG CÁCH (INTERVALS) */}
                             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                                 <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                     <span>⏳</span> Khoảng cách ôn tập
                                 </h3>
                                 <p className="text-xs text-slate-500 mb-6">Phân bố thời gian các thẻ được lặp lại</p>
                                 
                                 <SimpleBarChart 
                                    data={stats.intervals.data} 
                                    labels={stats.intervals.labels}
                                    color="bg-slate-300"
                                 />
                             </div>

                             {/* 4. CÔNG CỤ (TOOLS) */}
                             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
                                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                     <span>🛠️</span> Công cụ & Cài đặt
                                 </h3>

                                 <div className="space-y-4">
                                     {/* Daily Limit */}
                                     <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                         <div>
                                             <div className="text-sm font-bold text-slate-700">Giới hạn học/ngày</div>
                                             <div className="text-xs text-slate-400">Tránh bị quá tải kiến thức</div>
                                         </div>
                                         <div className="flex items-center gap-2">
                                             {isEditingLimit ? (
                                                <>
                                                    <input 
                                                        type="number" 
                                                        value={tempLimit} 
                                                        onChange={(e) => setTempLimit(e.target.value)}
                                                        className="w-16 px-2 py-1 border rounded text-center font-bold text-sm"
                                                    />
                                                    <button onClick={handleSaveLimit} className="text-white font-bold text-xs bg-green-500 px-3 py-1.5 rounded shadow">OK</button>
                                                </>
                                            ) : (
                                                <button onClick={() => setIsEditingLimit(true)} className="text-indigo-600 font-bold hover:bg-white px-3 py-1.5 rounded-lg border border-transparent hover:border-indigo-100 transition-all text-sm">
                                                    {stats.today.limit} thẻ ✏️
                                                </button>
                                            )}
                                         </div>
                                     </div>

                                     {/* Import */}
                                     <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                         {!showImport ? (
                                            <button 
                                                onClick={() => setShowImport(true)}
                                                className="w-full flex items-center justify-between text-slate-600 font-bold text-sm hover:text-indigo-600 transition-colors"
                                            >
                                                <span>📥 Nhập từ Google Sheet</span>
                                                <span className="text-xl">›</span>
                                            </button>
                                        ) : (
                                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                                <div className="text-xs font-bold text-slate-400 uppercase">Dán link Google Sheet (CSV)</div>
                                                <input 
                                                    type="text"
                                                    placeholder="https://docs.google.com/..."
                                                    value={importUrl}
                                                    onChange={(e) => setImportUrl(e.target.value)}
                                                    className="w-full px-3 py-2 text-xs border border-indigo-200 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                                />
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={handleImportSheet}
                                                        disabled={importStatus === 'loading'}
                                                        className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs rounded font-bold disabled:opacity-50 shadow"
                                                    >
                                                        {importStatus === 'loading' ? 'Processing...' : 'Import'}
                                                    </button>
                                                    <button onClick={() => setShowImport(false)} className="px-3 py-2 text-xs text-slate-500 bg-white border border-slate-200 rounded hover:bg-slate-100">Cancel</button>
                                                </div>
                                                {importMsg && (
                                                    <div className={`text-[10px] p-2 rounded font-medium ${importStatus === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                        {importMsg}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                     </div>
                                 </div>
                             </div>

                         </div>
                     </div>
                 ) : (
                     <div className="flex items-center justify-center h-64 text-slate-400">
                         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400 mr-3"></div>
                         Đang phân tích dữ liệu...
                     </div>
                 )}
             </div>

             {/* FORGOTTEN CARDS MODAL */}
             {showForgotten && (
                 <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                     <div className="bg-white w-full max-w-lg max-h-[80vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
                         <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-red-50 rounded-t-2xl">
                             <h3 className="font-bold text-red-800 flex items-center gap-2">
                                 <span>⚠️</span> Từ đã quên hôm nay
                             </h3>
                             <button onClick={() => setShowForgotten(false)} className="text-red-400 hover:text-red-700 font-bold px-2">✕</button>
                         </div>
                         <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                             {forgottenList.length === 0 ? (
                                 <div className="text-center text-slate-400 py-8">Bạn chưa quên từ nào hôm nay.</div>
                             ) : (
                                 <div className="space-y-3">
                                     {forgottenList.map(card => (
                                         <div key={card.id} className="p-3 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-shadow">
                                             <div className="flex justify-between items-start mb-1">
                                                 <h4 className="font-bold text-slate-900 text-lg">{card.term}</h4>
                                                 {card.phonetic && <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500">/{card.phonetic}/</span>}
                                             </div>
                                             <p className="text-slate-600 text-sm">{card.meaning}</p>
                                         </div>
                                     ))}
                                 </div>
                             )}
                         </div>
                         <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl text-center">
                             <button onClick={() => setShowForgotten(false)} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800">Đóng</button>
                         </div>
                     </div>
                 </div>
             )}
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
                     {/* REMOVED PHONETIC FROM FRONT */}
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
                     
                     {/* MOVED PHONETIC TO BACK */}
                     {currentCard.phonetic && (
                        <div className="mb-6 flex justify-center">
                            <span className="text-slate-500 font-mono text-xl bg-slate-50 px-4 py-1.5 rounded-lg border border-slate-100 tracking-wide">
                                /{currentCard.phonetic}/
                            </span>
                        </div>
                     )}

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
