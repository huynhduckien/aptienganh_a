import React, { useState, useEffect } from 'react';
import { AnkiStats, Deck, Flashcard } from '../types';
import { getAnkiStats, saveFlashcard, getDecks, createDeck, deleteDeck, getCardsByDeck, getDueFlashcards, setDailyLimit, importFlashcardsFromSheet } from '../services/flashcardService';

interface DashboardProps {
  onOpenFlashcards: (deckId?: string) => void;
  syncKey: string | null;
  onSetSyncKey: (key: string) => void;
  onOpenAdmin: () => void;
  dueCount: number;
}

// --- CHART COMPONENTS (Local to Dashboard) ---

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

const StackedForecastChart = ({ young, mature, labels }: { young: number[], mature: number[], labels: string[] }) => {
    let localMax = 0;
    for (let i = 0; i < young.length; i++) {
        const total = young[i] + mature[i];
        if (total > localMax) localMax = total;
    }
    const safeMax = Math.max(localMax, 5); 
    
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
          <div className="absolute left-0 top-6 bottom-8 w-8 flex flex-col justify-between text-[10px] text-slate-400 text-right pr-2 font-mono">
              <span>{safeMax}</span>
              <span>{Math.round(safeMax / 2)}</span>
              <span>0</span>
          </div>
          <div className="absolute left-10 right-4 top-6 bottom-8 flex flex-col justify-between pointer-events-none z-0">
              <div className="border-t border-slate-100 w-full h-0"></div>
              <div className="border-t border-slate-100 w-full h-0 border-dashed"></div>
              <div className="border-b border-slate-300 w-full h-0"></div>
          </div>
          <div className="flex items-end justify-between h-full w-full relative z-10 gap-[1px]">
              {young.map((yVal, idx) => {
                  const mVal = mature[idx];
                  const total = yVal + mVal;
                  const heightPercent = (total / safeMax) * 100;
                  const youngHeightPercent = total > 0 ? (yVal / total) * 100 : 0;
                  const matureHeightPercent = total > 0 ? (mVal / total) * 100 : 0;

                  return (
                      <div key={idx} className="flex-1 flex flex-col justify-end items-center group relative min-w-[2px] h-full">
                          <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-20 whitespace-nowrap transition-opacity shadow-lg">
                              Day {labels[idx]}: <span className="font-bold">{total}</span>
                          </div>
                          <div className="w-full flex flex-col-reverse rounded-t-[2px] overflow-hidden hover:opacity-80 transition-opacity cursor-crosshair" style={{ height: `${heightPercent}%` }}>
                              <div className="w-full bg-[#15803d]" style={{ height: `${matureHeightPercent}%` }}></div>
                              <div className="w-full bg-[#a3e635]" style={{ height: `${youngHeightPercent}%` }}></div>
                          </div>
                      </div>
                  )
              })}
          </div>
          <div className="absolute left-10 right-4 bottom-0 h-6">
              {ticks.map((tick, i) => (
                  <div key={i} className="absolute top-0 text-[10px] text-slate-500 transform -translate-x-1/2 text-center font-medium" style={{ left: tick.left }}>
                      {tick.label}
                  </div>
              ))}
          </div>
      </div>
    );
};

const DonutChart = ({ counts }: { counts: any }) => {
    const total = Math.max(counts.total, 1);
    const pNew = (counts.new / total) * 360;
    const pLearning = (counts.learning / total) * 360;
    const pYoung = (counts.young / total) * 360;
    const pMature = (counts.mature / total) * 360;
    
    const gradient = `conic-gradient(#3b82f6 0deg ${pNew}deg, #f97316 ${pNew}deg ${pNew+pLearning}deg, #a3e635 ${pNew+pLearning}deg ${pNew+pLearning+pYoung}deg, #15803d ${pNew+pLearning+pYoung}deg 360deg)`;
    
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <div className="relative w-40 h-40 shrink-0 rounded-full shadow-inner mb-6 ring-8 ring-slate-50" style={{ background: gradient }}>
                   <div className="absolute inset-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                       <div className="text-center">
                           <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tổng số</div>
                           <div className="text-3xl font-black text-slate-800">{counts.total}</div>
                       </div>
                   </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 w-full max-w-xs text-xs font-medium">
                   <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> New</span><span className="font-bold">{counts.new}</span></div>
                   <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-orange-500 rounded-sm"></div> Learning</span><span className="font-bold">{counts.learning}</span></div>
                   <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-[#a3e635] rounded-sm"></div> Young</span><span className="font-bold">{counts.young}</span></div>
                   <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-600"><div className="w-3 h-3 bg-[#15803d] rounded-sm"></div> Mature</span><span className="font-bold">{counts.mature}</span></div>
            </div>
        </div>
    )
};


export const Dashboard: React.FC<DashboardProps> = ({ 
    onOpenFlashcards, syncKey, onSetSyncKey, onOpenAdmin, dueCount
}) => {
  const [inputKey, setInputKey] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [stats, setStats] = useState<AnkiStats | null>(null);
  const [deckStats, setDeckStats] = useState<AnkiStats | null>(null);
  
  // Deck State
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null); // Viewing details
  const [deckCards, setDeckCards] = useState<Flashcard[]>([]); // Cards in selected deck
  const [deckDueCount, setDeckDueCount] = useState(0);

  const [viewMode, setViewMode] = useState<'overview' | 'deckDetail'>('overview');
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');

  // Add Card State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [newPhonetic, setNewPhonetic] = useState('');
  const [newExample, setNewExample] = useState('');

  // Deck Detail Configuration States
  const [forecastRange, setForecastRange] = useState<'1m' | '3m' | '1y'>('1m');
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState('50');
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState('');


  useEffect(() => {
      refreshData();
  }, [dueCount, syncKey]);

  const refreshData = async () => {
      try {
          const s = await getAnkiStats();
          setStats(s);
          const d = await getDecks();
          setDecks(d);
          
          if (selectedDeck) {
              refreshDeckStats(selectedDeck.id);
          }
      } catch (e) {}
  };

  const refreshDeckStats = async (deckId: string) => {
      const dStats = await getAnkiStats(deckId);
      setDeckStats(dStats);
      setTempLimit(dStats.today.limit.toString());
      
      const cards = await getCardsByDeck(deckId);
      setDeckCards(cards);
      
      const due = await getDueFlashcards(deckId);
      setDeckDueCount(due.length);
  };

  const handleSyncLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if(inputKey.trim()) onSetSyncKey(inputKey.trim());
  };

  const handleAdminLogin = () => {
    if (adminPass === 'admin') {
        onOpenAdmin();
        setAdminMode(false);
        setAdminPass('');
    } else {
        alert("Sai mật khẩu Admin (Gợi ý: admin)");
    }
  };

  const handleCreateDeck = async () => {
      if (!newDeckName.trim()) return;
      const newDeck = await createDeck(newDeckName.trim());
      setNewDeckName('');
      setShowCreateDeck(false);
      refreshData();
      
      // Auto-open new deck
      handleOpenDeck(newDeck);
  };

  const handleDeleteDeck = async (id: string) => {
      if(confirm('Xóa bộ thẻ này? Tất cả thẻ trong bộ sẽ bị xóa!')) {
          await deleteDeck(id);
          setViewMode('overview');
          setSelectedDeck(null);
          refreshData();
      }
  };

  const handleOpenDeck = async (deck: Deck) => {
      setSelectedDeck(deck);
      setDeckStats(null); // Reset while loading
      setViewMode('deckDetail');
      await refreshDeckStats(deck.id);
  };

  const handleSaveCard = async () => {
      if (!newTerm || !newMeaning) return;
      
      await saveFlashcard({
          term: newTerm,
          meaning: newMeaning,
          phonetic: newPhonetic,
          explanation: newExample,
          deckId: selectedDeck?.id // If inside a deck, add to it. If overview, adds to global/null
      });

      setShowAddModal(false);
      setNewTerm(''); setNewMeaning(''); setNewPhonetic(''); setNewExample('');
      
      refreshData();
      alert("Đã thêm thẻ mới!");
  };

  const handleSaveLimit = () => {
      const val = parseInt(tempLimit);
      if (val > 0) {
          setDailyLimit(val);
          setIsEditingLimit(false);
          refreshData(); // Refresh to update limit in stats
      }
  };

  const handleImportSheet = async () => {
      if (!importUrl || !selectedDeck) return;
      setImportStatus('loading');
      setImportMsg('Đang tải dữ liệu...');
      
      const result = await importFlashcardsFromSheet(importUrl, selectedDeck.id);
      
      if (result.error) {
          setImportStatus('error');
          setImportMsg(result.error);
      } else {
          setImportStatus('success');
          setImportMsg(`Thành công! Đã thêm ${result.added} thẻ mới.`);
          setImportUrl('');
          refreshData();
      }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 animate-in fade-in duration-500">
      
      {/* HEADER & LOGIN */}
      {!syncKey ? (
          <div className="mb-12 bg-slate-900 rounded-3xl p-8 md:p-12 text-white shadow-2xl relative overflow-hidden">
              <div className="relative z-10 max-w-2xl">
                  <h1 className="text-4xl font-bold mb-4">Flashcard Master 🧠</h1>
                  <p className="text-slate-300 mb-8 text-lg">Hệ thống lặp lại ngắt quãng (SRS) giúp bạn ghi nhớ từ vựng vĩnh viễn.</p>
                  <form onSubmit={handleSyncLogin} className="flex flex-col sm:flex-row gap-4">
                      <input type="text" value={inputKey} onChange={(e) => setInputKey(e.target.value)} placeholder="Nhập mã học viên..." className="flex-1 px-6 py-4 rounded-xl text-slate-900 font-bold focus:outline-none" />
                      <button type="submit" className="px-8 py-4 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl shadow-lg">Bắt đầu</button>
                  </form>
                  <div className="mt-4"><button onClick={() => setAdminMode(!adminMode)} className="text-xs text-slate-500 hover:text-white">Admin Login</button></div>
                  {adminMode && (
                      <div className="mt-2 flex gap-2">
                        <input type="password" value={adminPass} onChange={(e)=>setAdminPass(e.target.value)} className="px-2 py-1 rounded text-black text-sm"/>
                        <button onClick={handleAdminLogin} className="bg-slate-700 px-2 py-1 rounded text-sm">Go</button>
                      </div>
                  )}
              </div>
          </div>
      ) : (
          <div className="mb-8 flex justify-between items-center bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-lg">{syncKey.charAt(0).toUpperCase()}</div>
                  <div><div className="text-xs font-bold text-slate-400 uppercase">Học viên</div><div className="font-bold text-slate-900">{syncKey}</div></div>
              </div>
              <button onClick={() => { if(confirm('Đăng xuất?')) onSetSyncKey(''); }} className="text-sm font-bold text-slate-400 hover:text-red-500">Đăng xuất</button>
          </div>
      )}

      {/* OVERVIEW DASHBOARD */}
      {syncKey && viewMode === 'overview' && (
          <div className="space-y-8">
              {/* GLOBAL STATS HERO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200 flex flex-col justify-between relative overflow-hidden group">
                      <div className="relative z-10">
                          <h2 className="text-2xl font-bold mb-2">Tổng quan hôm nay</h2>
                          <div className="text-6xl font-black mb-1">{dueCount}</div>
                          <div className="text-indigo-200 text-sm font-medium mb-6">Thẻ cần học (Tất cả bộ thẻ)</div>
                      </div>
                      <div className="relative z-10">
                           {dueCount > 0 ? (
                               <button onClick={() => onOpenFlashcards()} className="w-full bg-white text-indigo-600 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-50 transition-all active:scale-95 flex items-center justify-center gap-2">
                                   <span>🔥</span> Ôn tập tất cả
                               </button>
                           ) : (
                               <div className="w-full bg-white/20 text-white py-4 rounded-xl font-bold text-lg text-center backdrop-blur-sm">
                                   Đã hoàn thành! 🎉
                               </div>
                           )}
                      </div>
                      <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4">
                          <svg width="200" height="200" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                      </div>
                  </div>

                  {/* MINI STATS */}
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 flex items-center justify-between">
                        {stats ? <DonutChart counts={stats.counts} /> : <div className="text-slate-400 text-sm animate-pulse">Đang tải thống kê...</div>}
                   </div>
              </div>

              {/* DECK LIST SECTION */}
              <div>
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                          <span>📚</span> Bộ thẻ của bạn
                      </h3>
                      <button onClick={() => setShowCreateDeck(true)} className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-sm hover:bg-slate-800">
                          + Tạo bộ thẻ
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {decks.map(deck => (
                          <div key={deck.id} onClick={() => handleOpenDeck(deck)} className="bg-white p-6 rounded-2xl border border-slate-200 hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group flex flex-col">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-indigo-100 transition-colors">🗂️</div>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }} className="text-slate-300 hover:text-red-500 p-1">✕</button>
                              </div>
                              <h4 className="font-bold text-lg text-slate-800 mb-1 group-hover:text-indigo-700">{deck.name}</h4>
                              <p className="text-xs text-slate-400">Tạo ngày {new Date(deck.createdAt).toLocaleDateString()}</p>
                          </div>
                      ))}

                      {/* Add Deck Card */}
                      <div onClick={() => setShowCreateDeck(true)} className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer min-h-[160px]">
                          <span className="text-3xl mb-2">+</span>
                          <span className="font-bold">Tạo bộ mới</span>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* DECK DETAIL DASHBOARD (Refactored to match image) */}
      {syncKey && viewMode === 'deckDetail' && selectedDeck && deckStats && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => setViewMode('overview')} className="flex items-center text-slate-500 hover:text-indigo-600 font-bold">← Quay lại</button>
                  <div className="h-4 w-px bg-slate-300"></div>
                  <h2 className="text-2xl font-black text-slate-900">{selectedDeck.name}</h2>
              </div>
              
              {/* TOP ROW: TODAY & INVENTORY */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  {/* HERO */}
                  <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                           <div className="flex items-center gap-2 font-bold text-slate-800"><span>📅</span> Hôm nay</div>
                           <div className="text-xs font-bold text-slate-400 uppercase">Tiến độ ngày</div>
                      </div>
                      
                      <div className="flex flex-col md:flex-row items-center justify-between gap-8 flex-1">
                          <div>
                               <div className="text-6xl font-black text-slate-900 mb-2">{deckDueCount}</div>
                               <div className="text-sm font-medium text-slate-500">thẻ cần ôn tập ngay</div>
                               <p className="text-xs text-slate-400 mt-1">Đừng để dồn bài nhé!</p>
                          </div>
                          
                          <div className="w-full md:w-auto flex flex-col gap-4">
                              {deckDueCount > 0 ? (
                                  <button onClick={() => onOpenFlashcards(selectedDeck.id)} className="w-full md:w-64 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                                      <span>⚡</span> Bắt đầu học ngay
                                  </button>
                              ) : (
                                  <div className="w-full md:w-64 py-4 bg-slate-100 text-slate-400 font-bold rounded-xl text-center">Đã học xong!</div>
                              )}
                              
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                                      <div className="text-xl font-bold text-slate-800">{deckStats.today.studied}</div>
                                      <div className="text-[10px] font-bold text-slate-400 uppercase">ĐÃ HỌC</div>
                                  </div>
                                  <div className="bg-red-50 p-3 rounded-xl border border-red-100 text-center">
                                      <div className="text-xl font-bold text-red-600">{deckStats.today.againCount}</div>
                                      <div className="text-[10px] font-bold text-red-400 uppercase">QUÊN BÀI</div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* INVENTORY */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                      <div className="font-bold text-slate-800 mb-4 flex items-center gap-2"><span>📦</span> Kho thẻ</div>
                      <div className="h-64">
                          <DonutChart counts={deckStats.counts} />
                      </div>
                  </div>
              </div>

              {/* MIDDLE ROW: FORECAST */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-8">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                      <div>
                          <div className="font-bold text-slate-800 flex items-center gap-2"><span>📈</span> Dự báo tương lai</div>
                          <p className="text-xs text-slate-500 mt-1">Số lượng thẻ sẽ đến hạn ôn tập trong thời gian tới</p>
                      </div>
                      <div className="flex gap-2">
                          {['1m', '3m', '1y'].map(r => (
                              <button 
                                key={r} onClick={()=>setForecastRange(r as any)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${forecastRange===r ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                {r === '1m' ? '1 tháng' : r === '3m' ? '3 tháng' : '1 năm'}
                              </button>
                          ))}
                      </div>
                  </div>
                  <div className="flex justify-end gap-4 text-xs font-medium mb-2">
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#a3e635]"></span>Young (Đang học)</div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#15803d]"></span>Mature (Đã thuộc)</div>
                  </div>
                  <StackedForecastChart 
                      young={deckStats.forecast.young.slice(0, forecastRange==='1m'?30:forecastRange==='3m'?90:365)} 
                      mature={deckStats.forecast.mature.slice(0, forecastRange==='1m'?30:forecastRange==='3m'?90:365)} 
                      labels={deckStats.forecast.labels.slice(0, forecastRange==='1m'?30:forecastRange==='3m'?90:365)} 
                  />
              </div>

              {/* BOTTOM ROW: INTERVALS & TOOLS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* INTERVALS */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                      <div className="font-bold text-slate-800 flex items-center gap-2 mb-2"><span>⏳</span> Khoảng cách ôn tập</div>
                      <p className="text-xs text-slate-500 mb-6">Phân bố thời gian các thẻ được lặp lại</p>
                      <SimpleBarChart data={deckStats.intervals.data} labels={deckStats.intervals.labels} />
                  </div>

                  {/* TOOLS & SETTINGS */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col">
                      <div className="font-bold text-slate-800 flex items-center gap-2 mb-6"><span>🛠️</span> Công cụ & Cài đặt</div>
                      
                      <div className="space-y-4">
                          {/* Limit */}
                          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
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
                                                className="w-16 px-2 py-1 border rounded text-center font-bold text-sm text-slate-900"
                                            />
                                            <button onClick={handleSaveLimit} className="text-white font-bold text-xs bg-green-500 px-3 py-1.5 rounded shadow">OK</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setIsEditingLimit(true)} className="text-indigo-600 font-bold hover:bg-white px-3 py-1.5 rounded-lg border border-transparent hover:border-indigo-100 transition-all text-sm flex items-center gap-1">
                                            {deckStats.today.limit} thẻ <span>✏️</span>
                                        </button>
                                    )}
                               </div>
                          </div>

                          {/* Import */}
                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                               {!showImport ? (
                                  <button onClick={() => setShowImport(true)} className="w-full flex items-center justify-between text-slate-600 font-bold text-sm hover:text-indigo-600 transition-colors">
                                      <div className="flex items-center gap-2"><span>📥</span> Nhập từ Google Sheet</div>
                                      <span className="text-xl">›</span>
                                  </button>
                              ) : (
                                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
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
                                              {importStatus === 'loading' ? 'Đang xử lý...' : 'Nhập'}
                                          </button>
                                          <button onClick={() => setShowImport(false)} className="px-3 py-2 text-xs text-slate-500 bg-white border border-slate-200 rounded hover:bg-slate-100">Hủy</button>
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
                      
                      <div className="mt-auto pt-4">
                          <button onClick={() => setShowAddModal(true)} className="w-full py-3 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-all">
                              + Thêm thẻ thủ công
                          </button>
                      </div>
                  </div>
              </div>

              {/* CARD LIST */}
              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                  <div className="px-8 py-4 border-b border-slate-100 bg-slate-50/50 font-bold text-slate-600 flex justify-between items-center">
                      <span>Danh sách thẻ ({deckCards.length})</span>
                  </div>
                  {deckCards.length === 0 ? (
                      <div className="p-12 text-center text-slate-400">
                          Chưa có thẻ nào trong bộ này. Hãy thêm thẻ mới!
                      </div>
                  ) : (
                      <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto custom-scrollbar">
                          {deckCards.map(card => (
                              <div key={card.id} className="px-8 py-4 flex justify-between items-center hover:bg-slate-50 group">
                                  <div>
                                      <div className="font-bold text-slate-900">{card.term}</div>
                                      <div className="text-sm text-slate-500">{card.meaning}</div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                       <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${card.interval >= 21 ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                           {card.interval >= 21 ? 'Mature' : 'Young'}
                                       </span>
                                       <span className="text-xs text-slate-400 font-mono">
                                            Next: {new Date(card.nextReview).toLocaleDateString()}
                                       </span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* MODAL: CREATE DECK */}
      {showCreateDeck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in zoom-in-95">
                  <h3 className="font-bold text-lg mb-4">Tạo bộ thẻ mới</h3>
                  <input 
                      autoFocus
                      value={newDeckName}
                      onChange={e => setNewDeckName(e.target.value)}
                      placeholder="Tên bộ thẻ (VD: IELTS Words)"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setShowCreateDeck(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Hủy</button>
                      <button onClick={handleCreateDeck} disabled={!newDeckName.trim()} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50">Tạo</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL: ADD CARD */}
      {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                          <h3 className="font-bold text-lg">Thêm Flashcard mới</h3>
                          {selectedDeck && <span className="text-xs text-indigo-600 font-bold uppercase">Vào bộ: {selectedDeck.name}</span>}
                      </div>
                      <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold px-2">✕</button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Từ vựng</label>
                          <input 
                            value={newTerm} onChange={e => setNewTerm(e.target.value)} 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                            placeholder="Nhập từ..."
                          />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Phiên âm</label>
                              <input value={newPhonetic} onChange={e => setNewPhonetic(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 font-mono text-sm" placeholder="/.../" />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nghĩa</label>
                              <input value={newMeaning} onChange={e => setNewMeaning(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 font-bold text-sm" placeholder="Nghĩa tiếng Việt" />
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ví dụ / Ghi chú</label>
                          <textarea value={newExample} onChange={e => setNewExample(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm h-24 resize-none" placeholder="Câu ví dụ..." ></textarea>
                      </div>

                      <button onClick={handleSaveCard} disabled={!newTerm || !newMeaning} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50">
                          Lưu thẻ
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};