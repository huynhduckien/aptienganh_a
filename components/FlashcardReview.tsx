
import React, { useState, useEffect } from 'react';
import { Flashcard, ReviewRating, AnkiStats } from '../types';
import { updateCardStatus, getAnkiStats, setDailyLimit, importFlashcardsFromSheet } from '../services/flashcardService';

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
  const [forecastRange, setForecastRange] = useState<'1m' | '3m'>('1m');

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
        
        // Auto-detect Chinese characters (Hanzi) range \u4e00-\u9fa5
        if (/[\u4e00-\u9fa5]/.test(text)) {
            utterance.lang = 'zh-CN';
        } else {
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

  const formatInterval = (days: number): string => {
      if (days === 0) return "< 1m";
      if (days < 1) return "1d"; 
      if (days < 30) return `${days}d`;
      if (days < 365) return `${Math.round(days/30)}mo`;
      return `${(days/365).toFixed(1)}y`;
  };

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

  // --- CHART COMPONENTS (CSS ONLY) ---

  const SimpleBarChart = ({ data, labels, color = 'bg-slate-300' }: { data: number[], labels: string[], color?: string }) => {
      const max = Math.max(...data, 1);
      return (
          <div className="flex items-end justify-between h-32 gap-1 pt-4">
              {data.map((val, idx) => {
                   // Skip some bars if too many
                   if (data.length > 15 && idx % 2 !== 0) return null;
                   
                   return (
                      <div key={idx} className="flex-1 flex flex-col items-center group relative">
                          <div 
                              className={`w-full ${color} rounded-t-sm hover:brightness-90 transition-all`}
                              style={{ height: `${(val / max) * 100}%` }}
                          ></div>
                          {/* Label every X items */}
                          {(data.length <= 10 || idx % 5 === 0) && (
                              <span className="text-[9px] text-slate-400 mt-1 absolute top-full">{labels[idx]}</span>
                          )}
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none z-10 whitespace-nowrap">
                              {labels[idx]}: {val}
                          </div>
                      </div>
                   )
              })}
          </div>
      )
  };

  const DonutChart = ({ counts }: { counts: AnkiStats['counts'] }) => {
      const total = Math.max(counts.total, 1);
      
      // Calculate degrees
      const pNew = (counts.new / total) * 360;
      const pLearning = (counts.learning / total) * 360;
      const pYoung = (counts.young / total) * 360;
      const pMature = (counts.mature / total) * 360;

      // Conic Gradient Logic
      // New (Blue) -> Learning (Orange) -> Young (Light Green) -> Mature (Dark Green)
      const gradient = `conic-gradient(
          #3b82f6 0deg ${pNew}deg, 
          #f97316 ${pNew}deg ${pNew + pLearning}deg,
          #86efac ${pNew + pLearning}deg ${pNew + pLearning + pYoung}deg,
          #22c55e ${pNew + pLearning + pYoung}deg 360deg
      )`;

      return (
          <div className="flex items-center gap-6">
               <div className="relative w-32 h-32 rounded-full" style={{ background: gradient }}>
                   <div className="absolute inset-8 bg-white rounded-full flex items-center justify-center">
                       <div className="text-center">
                           <div className="text-xs text-slate-400 font-bold">Total</div>
                           <div className="text-xl font-bold text-slate-800">{counts.total}</div>
                       </div>
                   </div>
               </div>
               <div className="space-y-1 text-xs font-medium">
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> New: {counts.new}</div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-500 rounded-sm"></div> Learning: {counts.learning}</div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-300 rounded-sm"></div> Young: {counts.young}</div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Mature: {counts.mature}</div>
               </div>
          </div>
      )
  };

  // --- MAIN RENDER ---

  if (view === 'overview') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100 p-4 overflow-y-auto">
             <div className="w-full max-w-6xl mx-auto space-y-6 pb-10">
                 
                 {/* Header & Back */}
                 <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                     <h2 className="text-xl font-bold text-slate-800">Thống kê & Ôn tập</h2>
                     <button onClick={onClose} className="text-slate-500 hover:text-slate-800 font-bold px-4">Đóng</button>
                 </div>

                 {stats ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         
                         {/* CARD: HÔM NAY */}
                         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
                             <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Hôm nay</h3>
                             <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                                 {queue.length > 0 ? (
                                     <>
                                        <p className="text-slate-500 text-sm">Bạn có <strong className="text-slate-900">{queue.length}</strong> thẻ cần ôn tập ngay.</p>
                                        <button 
                                            onClick={() => setView('review')}
                                            className="px-8 py-3 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700 transition-all"
                                        >
                                            Bắt đầu học ngay
                                        </button>
                                     </>
                                 ) : (
                                     <p className="text-slate-400">Không có thẻ nào cần học hôm nay.</p>
                                 )}
                                 
                                 <div className="mt-4 pt-4 border-t w-full text-xs text-slate-500 flex justify-between">
                                     <span>Đã học: {stats.today.studied} thẻ</span>
                                     <span>Học lại: {stats.today.againCount}</span>
                                     <span>Thuộc: {stats.today.matureCount}</span>
                                 </div>
                             </div>
                         </div>

                         {/* CARD: DỰ BÁO */}
                         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
                             <div className="flex justify-between items-center mb-4 border-b pb-2">
                                <h3 className="text-lg font-semibold text-slate-800">Dự báo</h3>
                                <div className="space-x-2 text-[10px]">
                                    <label><input type="radio" checked={forecastRange==='1m'} onChange={()=>setForecastRange('1m')} /> 1 tháng</label>
                                    <label><input type="radio" checked={forecastRange==='3m'} onChange={()=>setForecastRange('3m')} /> 3 tháng</label>
                                </div>
                             </div>
                             <div className="flex-1">
                                 <div className="text-center text-xs text-slate-500 mb-2">Số thẻ ôn tập đến hạn trong tương lai.</div>
                                 <SimpleBarChart 
                                    data={forecastRange === '1m' ? stats.forecast.data.slice(0, 30) : stats.forecast.data} 
                                    labels={forecastRange === '1m' ? stats.forecast.labels.slice(0, 30) : stats.forecast.labels} 
                                    color="bg-slate-300"
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
                             <div className="flex-1">
                                 <div className="text-center text-xs text-slate-500 mb-2">Thời gian giãn cách đến khi hiện thẻ ôn tập lần nữa</div>
                                 <SimpleBarChart 
                                    data={stats.intervals.data} 
                                    labels={stats.intervals.labels}
                                    color="bg-slate-400"
                                 />
                             </div>
                         </div>

                         {/* CARD: SETTINGS & IMPORT */}
                         <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-600">Giới hạn học mỗi ngày</span>
                                <div className="flex items-center gap-2">
                                    {isEditingLimit ? (
                                        <>
                                            <input 
                                                type="number" 
                                                value={tempLimit} 
                                                onChange={(e) => setTempLimit(e.target.value)}
                                                className="w-20 px-2 py-1 border rounded"
                                            />
                                            <button onClick={handleSaveLimit} className="text-green-600 font-bold text-sm">Lưu</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setIsEditingLimit(true)} className="text-indigo-600 font-bold hover:underline">
                                            {stats.today.limit} thẻ / ngày ✏️
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
                                        📥 Import từ Google Sheet
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        <input 
                                            type="text"
                                            placeholder="Dán link Google Sheet vào đây..."
                                            value={importUrl}
                                            onChange={(e) => setImportUrl(e.target.value)}
                                            className="w-full px-3 py-2 text-xs border rounded"
                                        />
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={handleImportSheet}
                                                disabled={importStatus === 'loading'}
                                                className="px-3 py-1 bg-indigo-600 text-white text-xs rounded font-bold hover:bg-indigo-700 disabled:opacity-50"
                                            >
                                                {importStatus === 'loading' ? 'Đang tải...' : 'Import'}
                                            </button>
                                            <button onClick={() => setShowImport(false)} className="text-xs text-slate-500">Hủy</button>
                                        </div>
                                        {importMsg && (
                                            <div className={`text-xs p-2 rounded ${importStatus === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                {importMsg}
                                            </div>
                                        )}
                                        <p className="text-[10px] text-slate-400">
                                            Lưu ý: Sheet phải có cột "Từ", "Nghĩa của từ". File phải được chia sẻ "Bất kỳ ai có đường liên kết".
                                        </p>
                                    </div>
                                )}
                            </div>
                         </div>

                     </div>
                 ) : (
                     <div className="text-center py-20 text-slate-400">Đang tính toán dữ liệu...</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-2xl h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Top Bar */}
        <div className="flex justify-between items-center bg-slate-50 p-4 border-b border-slate-200">
            <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Flashcards</span>
                <span className="font-mono text-sm text-slate-700 font-bold">{currentIndex + 1} / {queue.length}</span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-2">✕</button>
        </div>

        {/* Card Area */}
        <div className="flex-1 relative overflow-y-auto p-8 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
            
            <div className="mb-8">
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Từ vựng</span>
                 <h2 className="text-4xl md:text-5xl font-serif font-bold text-slate-900 mb-2">{currentCard.term}</h2>
                 <span className="text-slate-500 font-mono text-lg">/{currentCard.phonetic}/</span>
                 <button 
                        onClick={(e) => { e.stopPropagation(); playAudio(currentCard.term); }}
                        className="ml-2 text-indigo-500 hover:text-indigo-700 p-1 align-middle"
                    >
                        🔊
                </button>
            </div>

            {isFlipped ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full max-w-lg border-t pt-8 border-slate-100">
                     <div className="mb-6">
                        <span className="text-xs font-bold text-green-600 uppercase tracking-widest block mb-1">Nghĩa</span>
                        <p className="text-2xl font-bold text-slate-800">{currentCard.meaning}</p>
                     </div>
                     
                     <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Ngữ cảnh</span>
                        <p className="text-slate-600 italic">"{currentCard.explanation}"</p>
                     </div>
                </div>
            ) : (
                <div className="mt-8 text-slate-300 text-sm font-medium animate-pulse">
                    (Chạm để xem đáp án)
                </div>
            )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200">
            {isFlipped ? (
                <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => handleRate('again')} className="bg-rose-100 hover:bg-rose-200 text-rose-700 py-3 rounded-lg flex flex-col items-center border border-rose-200">
                        <span className="text-[10px] font-bold mb-1 opacity-70">{getIntervalPreview('again')}</span>
                        <span className="font-bold">Again</span>
                    </button>
                    <button onClick={() => handleRate('hard')} className="bg-orange-100 hover:bg-orange-200 text-orange-700 py-3 rounded-lg flex flex-col items-center border border-orange-200">
                        <span className="text-[10px] font-bold mb-1 opacity-70">{getIntervalPreview('hard')}</span>
                        <span className="font-bold">Hard</span>
                    </button>
                    <button onClick={() => handleRate('good')} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 py-3 rounded-lg flex flex-col items-center border border-emerald-200">
                        <span className="text-[10px] font-bold mb-1 opacity-70">{getIntervalPreview('good')}</span>
                        <span className="font-bold">Good</span>
                    </button>
                    <button onClick={() => handleRate('easy')} className="bg-sky-100 hover:bg-sky-200 text-sky-700 py-3 rounded-lg flex flex-col items-center border border-sky-200">
                        <span className="text-[10px] font-bold mb-1 opacity-70">{getIntervalPreview('easy')}</span>
                        <span className="font-bold">Easy</span>
                    </button>
                </div>
            ) : (
                <button onClick={() => setIsFlipped(true)} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800">
                    Hiện đáp án
                </button>
            )}
        </div>

      </div>
    </div>
  );
};
