import React, { useState, useEffect, useMemo } from 'react';
import { AnkiStats, Deck, Flashcard } from '../types';
import { getAnkiStats, saveFlashcard, getDecks, createDeck, deleteDeck, getCardsByDeck, getDueFlashcards, setDailyLimit, getDailyLimit, importFlashcardsFromSheet, getForgottenFlashcards } from '../services/flashcardService';

interface DashboardProps {
  onOpenFlashcards: (deckId?: string) => void;
  onReviewCards: (cards: Flashcard[]) => void;
  syncKey: string | null;
  onSetSyncKey: (key: string) => void;
  onOpenAdmin: () => void;
  dueCount: number;
  isSyncing: boolean; // NEW PROP
}

// --- MICRO COMPONENTS ---

const StatCard = ({ label, value, color, icon, onClick }: { label: string, value: number, color: string, icon: string, onClick?: () => void }) => (
    <div 
        onClick={onClick}
        className={`flex items-center p-4 rounded-2xl border ${color} bg-white shadow-sm transition-transform hover:scale-105 ${onClick ? 'cursor-pointer' : ''}`}
    >
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl bg-slate-50 mr-3 shadow-inner">
            {icon}
        </div>
        <div>
            <div className="text-2xl font-black text-slate-800">{value}</div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
        </div>
    </div>
);

const DeckCard = ({ deck, stats, onClick, onDelete }: { deck: Deck, stats: any, onClick: () => void, onDelete: (e: any) => void }) => {
    // Calculate simple progress based on mature cards
    const total = Math.max(stats?.counts.total || 1, 1);
    const mature = stats?.counts.mature || 0;
    const percent = Math.round((mature / total) * 100);
    const due = stats?.today.studied < stats?.today.limit ? (stats?.due || 0) : 0; 

    return (
        <div 
            onClick={onClick}
            className="group relative bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer hover:shadow-xl hover:border-indigo-300 transition-all duration-300 flex flex-col h-full"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 text-indigo-600 flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
                    🗂️
                </div>
                <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-opacity">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
            
            <h3 className="font-bold text-lg text-slate-800 mb-1 line-clamp-1 group-hover:text-indigo-700 transition-colors">
                {deck.name}
            </h3>
            <p className="text-xs text-slate-400 mb-4 flex-1">
                {stats ? `${stats.counts.total} thẻ` : 'Đang tải...'}
            </p>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2 overflow-hidden">
                <div className="bg-green-500 h-full rounded-full transition-all duration-1000" style={{ width: `${percent}%` }}></div>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                <span>Thành thạo {percent}%</span>
            </div>

            {/* Notification Badge for Due Cards */}
            {stats && stats.today.limit > stats.today.studied && stats.due > 0 && (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md animate-bounce">
                    {stats.due} cần ôn
                </div>
            )}
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = ({ 
    onOpenFlashcards, onReviewCards, syncKey, onSetSyncKey, onOpenAdmin, dueCount, isSyncing
}) => {
  const [inputKey, setInputKey] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [globalStats, setGlobalStats] = useState<AnkiStats | null>(null);
  
  // Deck Data
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckStatsMap, setDeckStatsMap] = useState<Record<string, any>>({});
  
  // View State
  const [viewMode, setViewMode] = useState<'overview' | 'deckDetail'>('overview');
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [selectedDeckCards, setSelectedDeckCards] = useState<Flashcard[]>([]);
  
  // Search & Filter in Deck Detail
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Forgotten Cards Modal
  const [showForgottenModal, setShowForgottenModal] = useState(false);
  const [forgottenCards, setForgottenCards] = useState<Flashcard[]>([]);

  // Daily Limit Modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempLimit, setTempLimit] = useState(50);

  // Add Card Form
  const [newTerm, setNewTerm] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [newPhonetic, setNewPhonetic] = useState('');
  const [newExample, setNewExample] = useState('');

  // Import Sheet State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [importMsg, setImportMsg] = useState('');

  // Initial Load and Sync Listener
  useEffect(() => {
      // Only refresh if NOT syncing. 
      // This ensures we don't fetch empty data while the DB is being populated.
      if (!isSyncing) {
          refreshAllData();
      }
  }, [syncKey, dueCount, isSyncing]);

  const refreshAllData = async () => {
      try {
          const gStats = await getAnkiStats();
          setGlobalStats(gStats);
          setTempLimit(getDailyLimit()); // Sync local state with storage
          
          const dList = await getDecks();
          setDecks(dList);

          // Pre-fetch stats for each deck for the dashboard cards
          const dStats: Record<string, any> = {};
          for (const d of dList) {
              const s = await getAnkiStats(d.id);
              const due = await getDueFlashcards(d.id);
              const forgotten = await getForgottenFlashcards(d.id);
              dStats[d.id] = { ...s, due: due.length, forgotten: forgotten.length };
          }
          setDeckStatsMap(dStats);

          if (selectedDeck) {
              const cards = await getCardsByDeck(selectedDeck.id);
              setSelectedDeckCards(cards);
          }
      } catch (e) {
          console.error(e);
      }
  };

  const handleSyncLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if(inputKey.trim()) onSetSyncKey(inputKey.trim());
  };

  const handleAdminLogin = () => {
    if (adminPass === 'admin') {
        onOpenAdmin();
        setAdminMode(false); setAdminPass('');
    } else { alert("Sai mật khẩu Admin"); }
  };

  const handleCreateDeck = async () => {
      if (!newDeckName.trim()) return;
      await createDeck(newDeckName.trim());
      setNewDeckName('');
      setShowCreateDeck(false);
      refreshAllData();
  };

  const handleDeleteDeck = async (e: any, id: string) => {
      e.stopPropagation();
      if(confirm('Cảnh báo: Xóa bộ thẻ này sẽ xóa TOÀN BỘ thẻ bên trong. Bạn chắc chứ?')) {
          await deleteDeck(id);
          refreshAllData();
      }
  };

  const handleOpenDeck = async (deck: Deck) => {
      setSelectedDeck(deck);
      const cards = await getCardsByDeck(deck.id);
      setSelectedDeckCards(cards);
      setSearchTerm('');
      setViewMode('deckDetail');
  };

  const handleSaveCard = async () => {
      if (!newTerm || !newMeaning) return;
      await saveFlashcard({
          term: newTerm, meaning: newMeaning, phonetic: newPhonetic, explanation: newExample,
          deckId: selectedDeck?.id
      });
      setShowAddModal(false);
      setNewTerm(''); setNewMeaning(''); setNewPhonetic(''); setNewExample('');
      if (selectedDeck) {
          const cards = await getCardsByDeck(selectedDeck.id);
          setSelectedDeckCards(cards);
      }
      refreshAllData();
      alert("Đã thêm thẻ mới!");
  };

  const handleImportSheet = async () => {
      if (!importUrl || !selectedDeck) return;
      setImportStatus('loading');
      setImportMsg('Đang tải và xử lý dữ liệu...');
      
      const result = await importFlashcardsFromSheet(importUrl, selectedDeck.id);
      
      if (result.error) {
          setImportStatus('error');
          setImportMsg(result.error);
      } else {
          setImportStatus('success');
          setImportMsg(`Thành công! Đã thêm ${result.added} thẻ mới vào bộ ${selectedDeck.name}.`);
          setImportUrl('');
          refreshAllData();
      }
  };

  const handleOpenForgotten = async () => {
      const deckId = viewMode === 'deckDetail' ? selectedDeck?.id : undefined;
      const forgotten = await getForgottenFlashcards(deckId);
      
      if (forgotten.length === 0) {
          alert("Tuyệt vời! Bạn không có thẻ nào đang bị quên.");
          return;
      }
      setForgottenCards(forgotten);
      setShowForgottenModal(true);
  };
  
  const handleSaveGoal = () => {
      setDailyLimit(tempLimit);
      setShowGoalModal(false);
      // Trigger a refresh to update "dueCount" based on new limit
      // We need to wait a tick or manually trigger update from parent if possible,
      // but here refreshing local data is a good start. 
      // Note: `dueCount` prop comes from parent, so we might need to tell App to update.
      // Ideally, the Dashboard should manage its own data fetching or we trigger a callback.
      // Since `dueCount` is passed down, we'll reload data here which might not update the prop immediately,
      // but `refreshAllData` updates `globalStats` which IS used for some displays.
      // To update the main Badge, we rely on the parent re-rendering or user interaction.
      // A full page reload is a brute force way, but let's try just refreshing data first.
      refreshAllData();
      // Also force parent update via a hack or callback if available? 
      // The parent passes `dueCount`. Let's assume the user starts reviewing or reloads if they want the badge updated.
      // Or better, we can add a callback to parent if strictly needed. For now, local stats update is fine.
      alert(`Đã cập nhật mục tiêu: ${tempLimit} thẻ/ngày`);
      window.location.reload(); // Simple reload to sync everything perfectly for now
  };

  // Filtered Cards logic
  const filteredCards = useMemo(() => {
      if (!searchTerm) return selectedDeckCards;
      const lower = searchTerm.toLowerCase();
      return selectedDeckCards.filter(c => 
          c.term.toLowerCase().includes(lower) || 
          c.meaning.toLowerCase().includes(lower)
      );
  }, [selectedDeckCards, searchTerm]);

  // --- RENDER ---

  if (!syncKey) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
            <div className="bg-white rounded-[32px] p-8 md:p-12 shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
                
                <div className="flex-1 pr-0 md:pr-12 mb-8 md:mb-0 z-10">
                    <div className="inline-block p-3 rounded-2xl bg-indigo-50 text-indigo-600 mb-6 text-3xl">🧠</div>
                    <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Flashcard Master</h1>
                    <p className="text-slate-500 text-lg mb-8 leading-relaxed">
                        Hệ thống học từ vựng thông minh sử dụng thuật toán Lặp lại ngắt quãng (SRS) giúp bạn ghi nhớ kiến thức vĩnh viễn.
                    </p>
                    
                    <form onSubmit={handleSyncLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Mã học viên của bạn</label>
                            <input 
                                type="text" 
                                value={inputKey} onChange={(e) => setInputKey(e.target.value)} 
                                placeholder="Ví dụ: student-1234" 
                                className="w-full px-6 py-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none" 
                            />
                        </div>
                        <button type="submit" disabled={isSyncing} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 text-lg">
                            {isSyncing ? 'Đang xác thực...' : 'Bắt đầu học ngay'}
                        </button>
                    </form>
                    
                    <div className="mt-6 flex justify-between items-center">
                        <button onClick={() => setAdminMode(!adminMode)} className="text-xs text-slate-400 hover:text-indigo-600 font-bold transition-colors">Admin Access</button>
                    </div>
                    {adminMode && (
                        <div className="mt-2 flex gap-2 animate-in fade-in slide-in-from-top-2">
                             <input type="password" value={adminPass} onChange={(e)=>setAdminPass(e.target.value)} placeholder="Password" className="px-3 py-2 rounded-lg border text-sm" />
                             <button onClick={handleAdminLogin} className="bg-slate-800 text-white px-3 py-2 rounded-lg text-sm font-bold">Login</button>
                        </div>
                    )}
                </div>

                <div className="flex-1 bg-slate-100 rounded-3xl relative overflow-hidden hidden md:block group">
                     {/* Decorative Elements */}
                     <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-9xl opacity-10 select-none group-hover:scale-110 transition-transform duration-700">📚</div>
                     <div className="absolute bottom-8 left-8 right-8 p-6 bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/50">
                         <div className="flex items-center gap-3 mb-2">
                             <div className="w-3 h-3 rounded-full bg-green-500"></div>
                             <div className="text-xs font-bold text-slate-400 uppercase">Trạng thái hệ thống</div>
                         </div>
                         <div className="font-bold text-slate-800">Sẵn sàng đồng bộ dữ liệu đám mây</div>
                     </div>
                </div>
            </div>
        </div>
      );
  }

  // Loading state inside dashboard
  if (isSyncing) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-4xl space-y-8 animate-pulse">
                  <div className="h-20 bg-slate-200 rounded-3xl w-full"></div>
                  <div className="grid grid-cols-12 gap-8">
                      <div className="col-span-8 space-y-6">
                          <div className="h-64 bg-slate-200 rounded-3xl w-full"></div>
                          <div className="grid grid-cols-2 gap-4">
                              <div className="h-40 bg-slate-200 rounded-2xl"></div>
                              <div className="h-40 bg-slate-200 rounded-2xl"></div>
                          </div>
                      </div>
                      <div className="col-span-4">
                           <div className="h-96 bg-slate-200 rounded-3xl w-full"></div>
                      </div>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen animate-in fade-in duration-500">
      
      {/* TOP NAVIGATION BAR */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-200">
                  {syncKey.charAt(0).toUpperCase()}
              </div>
              <div>
                  <h1 className="text-2xl font-black text-slate-900">Xin chào, {syncKey}!</h1>
                  <p className="text-sm text-slate-500 font-medium">Bạn đã sẵn sàng để học chưa?</p>
              </div>
          </div>
          <div className="flex items-center gap-3">
              <button 
                  onClick={() => setShowGoalModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-indigo-600 transition-colors text-sm flex items-center gap-2"
                  title="Đặt mục tiêu hàng ngày"
              >
                  <span>🎯</span> <span className="hidden sm:inline">Mục tiêu</span>
              </button>
              <button 
                  onClick={() => { if(confirm('Đăng xuất?')) onSetSyncKey(''); }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-red-500 transition-colors text-sm"
              >
                  Đăng xuất
              </button>
          </div>
      </header>

      {/* DASHBOARD CONTENT */}
      {viewMode === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* LEFT COLUMN: DECKS GRID (8 cols) */}
              <div className="lg:col-span-8 space-y-8">
                  
                  {/* Hero Action */}
                  <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-[32px] p-8 text-white shadow-2xl shadow-indigo-200 relative overflow-hidden">
                      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                          <div>
                              <div className="flex items-center gap-2 mb-1 opacity-80">
                                  <span className="animate-pulse">●</span>
                                  <span className="text-sm font-bold uppercase tracking-wider">Tổng quan hôm nay</span>
                              </div>
                              <div className="text-6xl md:text-7xl font-black tracking-tight mb-2">{dueCount}</div>
                              <div className="text-lg font-medium text-indigo-100 flex items-center gap-2">
                                  <span>thẻ cần ôn tập</span>
                                  {globalStats && (
                                      <span className="text-sm bg-white/20 px-2 py-0.5 rounded-lg border border-white/20">
                                          Đã học: {globalStats.today.studied}/{globalStats.today.limit}
                                      </span>
                                  )}
                              </div>
                          </div>
                          
                          {dueCount > 0 ? (
                              <button 
                                onClick={() => onOpenFlashcards()}
                                className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all active:scale-95 flex items-center gap-2"
                              >
                                  <span>🚀</span> Ôn tập ngay
                              </button>
                          ) : (
                              <div className="bg-white/20 backdrop-blur-md px-8 py-4 rounded-2xl font-bold text-lg text-center border border-white/30">
                                  🎉 Đã hoàn thành!
                              </div>
                          )}
                      </div>
                      
                      {/* Decoration */}
                      <div className="absolute -bottom-10 -right-10 text-9xl opacity-10 select-none">🔥</div>
                  </div>

                  {/* Decks Grid */}
                  <div>
                      <div className="flex justify-between items-end mb-6">
                          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                              <span>📚</span> Bộ thẻ của bạn
                          </h2>
                          <button 
                            onClick={() => setShowCreateDeck(true)}
                            className="text-sm font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
                          >
                              + Tạo bộ mới
                          </button>
                      </div>

                      {decks.length === 0 ? (
                          <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                              <div className="text-4xl mb-4">📭</div>
                              <h3 className="text-lg font-bold text-slate-700 mb-2">Chưa có bộ thẻ nào</h3>
                              <p className="text-slate-400 mb-6">Hãy tạo bộ thẻ đầu tiên để bắt đầu hành trình.</p>
                              <button onClick={() => setShowCreateDeck(true)} className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800">Tạo ngay</button>
                          </div>
                      ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {decks.map(deck => (
                                  <DeckCard 
                                    key={deck.id} 
                                    deck={deck} 
                                    stats={deckStatsMap[deck.id]} 
                                    onClick={() => handleOpenDeck(deck)}
                                    onDelete={(e) => handleDeleteDeck(e, deck.id)}
                                  />
                              ))}
                              
                              {/* Create New Placeholder Card */}
                              <button 
                                onClick={() => setShowCreateDeck(true)}
                                className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all min-h-[160px] group"
                              >
                                  <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">+</span>
                                  <span className="font-bold">Tạo bộ thẻ mới</span>
                              </button>
                          </div>
                      )}
                  </div>
              </div>

              {/* RIGHT COLUMN: STATS SIDEBAR (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                  <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm sticky top-6">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <span>📊</span> Thống kê nhanh
                      </h3>
                      
                      {globalStats ? (
                          <div className="space-y-4">
                                <StatCard label="Đã học hôm nay" value={globalStats.today.studied} color="border-blue-100" icon="📝" />
                                <StatCard label="Thẻ thuộc bài" value={globalStats.today.matureCount} color="border-green-100" icon="🌳" />
                                <StatCard 
                                    label="Thẻ bị quên (Xem)" 
                                    value={globalStats.forgotten} 
                                    color="border-red-100 hover:border-red-300 hover:bg-red-50" 
                                    icon="⚠️" 
                                    onClick={handleOpenForgotten}
                                />
                                
                                <div className="p-4 bg-slate-50 rounded-2xl mt-6">
                                    <div className="flex justify-between text-xs font-bold text-slate-500 uppercase mb-2">
                                        <span>Tổng quan kho thẻ</span>
                                        <span>{globalStats.counts.total} thẻ</span>
                                    </div>
                                    <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-200">
                                        <div style={{ width: `${(globalStats.counts.mature / globalStats.counts.total)*100}%` }} className="bg-green-500" title="Mature"></div>
                                        <div style={{ width: `${(globalStats.counts.young / globalStats.counts.total)*100}%` }} className="bg-lime-400" title="Young"></div>
                                        <div style={{ width: `${(globalStats.counts.learning / globalStats.counts.total)*100}%` }} className="bg-blue-400" title="Learning"></div>
                                        <div style={{ width: `${(globalStats.counts.new / globalStats.counts.total)*100}%` }} className="bg-slate-300" title="New"></div>
                                    </div>
                                    <div className="flex gap-2 mt-3 flex-wrap">
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><div className="w-2 h-2 rounded-full bg-green-500"></div>Thuộc</div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><div className="w-2 h-2 rounded-full bg-lime-400"></div>Đang học</div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><div className="w-2 h-2 rounded-full bg-blue-400"></div>Học lại</div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><div className="w-2 h-2 rounded-full bg-slate-300"></div>Mới</div>
                                    </div>
                                </div>
                          </div>
                      ) : (
                          <div className="animate-pulse space-y-4">
                              <div className="h-20 bg-slate-100 rounded-2xl"></div>
                              <div className="h-20 bg-slate-100 rounded-2xl"></div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* DECK DETAIL VIEW & MODALS REMAIN THE SAME, JUST WRAPPED IN THE FRAGMENT */}
      {viewMode === 'deckDetail' && selectedDeck && (
          <div className="animate-in slide-in-from-right-4 duration-300">
              {/* Deck Header */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setViewMode('overview')} className="bg-white border border-slate-200 p-3 rounded-xl hover:bg-slate-50 text-slate-500 transition-colors">
                          ←
                      </button>
                      <div>
                          <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Bộ thẻ</span>
                          </div>
                          <h1 className="text-3xl font-black text-slate-900">{selectedDeck.name}</h1>
                      </div>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto">
                       <button onClick={() => { setImportStatus('idle'); setShowImportModal(true); }} className="px-5 py-3 bg-white border border-slate-300 font-bold rounded-xl hover:bg-slate-50 text-slate-600 shadow-sm flex items-center gap-2">
                           📥 <span className="hidden md:inline">Nhập Sheet</span>
                       </button>
                       <button onClick={() => setShowAddModal(true)} className="flex-1 md:flex-none px-6 py-3 bg-white border border-slate-300 font-bold rounded-xl hover:bg-slate-50 text-slate-700 shadow-sm">
                           + Thêm thẻ
                       </button>
                       <button 
                            onClick={() => onOpenFlashcards(selectedDeck.id)} 
                            className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all active:scale-95"
                        >
                           ⚡ Ôn tập ngay
                       </button>
                  </div>
              </div>
              
              {/* Deck Stats Overview (Including Forgotten) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard label="Thẻ cần ôn" value={deckStatsMap[selectedDeck.id]?.due || 0} color="border-indigo-100" icon="🔥" />
                    <StatCard label="Đã thuộc" value={deckStatsMap[selectedDeck.id]?.counts.mature || 0} color="border-green-100" icon="🌳" />
                    <StatCard 
                        label="Bị quên (Xem)" 
                        value={deckStatsMap[selectedDeck.id]?.forgotten || 0} 
                        color="border-red-100 hover:border-red-300 hover:bg-red-50" 
                        icon="⚠️" 
                        onClick={handleOpenForgotten}
                    />
                    <StatCard label="Tổng số" value={deckStatsMap[selectedDeck.id]?.counts.total || 0} color="border-slate-100" icon="📦" />
              </div>

              {/* Cards List Manager */}
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                  {/* Toolbar */}
                  <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/50">
                      <div className="font-bold text-slate-700">Danh sách thẻ ({selectedDeckCards.length})</div>
                      <div className="relative w-full md:w-64">
                          <input 
                              type="text" 
                              placeholder="Tìm kiếm thẻ..." 
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</div>
                      </div>
                  </div>

                  {/* Table */}
                  <div className="flex-1 overflow-x-auto">
                      {filteredCards.length === 0 ? (
                          <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                              <span className="text-4xl mb-2">🍂</span>
                              <p>Không tìm thấy thẻ nào.</p>
                          </div>
                      ) : (
                          <table className="w-full text-left border-collapse">
                              <thead>
                                  <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-white sticky top-0 z-10">
                                      <th className="px-6 py-4">Thuật ngữ</th>
                                      <th className="px-6 py-4">Định nghĩa</th>
                                      <th className="px-6 py-4">Trạng thái</th>
                                      <th className="px-6 py-4">Lần ôn tới</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                  {filteredCards.map(card => (
                                      <tr key={card.id} className="hover:bg-indigo-50/30 transition-colors group">
                                          <td className="px-6 py-4">
                                              <div className="font-bold text-slate-900 text-lg">{card.term}</div>
                                              {card.phonetic && <div className="text-slate-400 font-mono text-xs mt-0.5">/{card.phonetic}/</div>}
                                          </td>
                                          <td className="px-6 py-4 max-w-xs">
                                              <div className="text-slate-700">{card.meaning}</div>
                                              {card.explanation && <div className="text-xs text-slate-400 mt-1 line-clamp-1 group-hover:line-clamp-none transition-all">{card.explanation}</div>}
                                          </td>
                                          <td className="px-6 py-4">
                                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${
                                                  card.isForgotten ? 'bg-red-100 text-red-700 animate-pulse' :
                                                  card.interval >= 21 ? 'bg-green-100 text-green-700' : 
                                                  card.interval >= 1 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                                              }`}>
                                                  {card.isForgotten ? 'Đang quên' : card.interval >= 21 ? 'Thành thạo' : card.interval >= 1 ? 'Đang học' : 'Mới'}
                                              </span>
                                          </td>
                                          <td className="px-6 py-4 text-sm font-mono text-slate-500">
                                              {new Date(card.nextReview).toLocaleDateString('vi-VN')}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* MODALS RENDER (Create Deck, Import Sheet, Add Card, Forgotten) - Code omitted for brevity as they are identical to previous version, just kept in context */}
      {showGoalModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white text-center">
                      <div className="text-4xl mb-2">🎯</div>
                      <h3 className="text-2xl font-black">Mục tiêu học tập</h3>
                      <p className="opacity-90 text-sm">Giới hạn số thẻ ôn tập mỗi ngày để tránh quá tải.</p>
                  </div>
                  
                  <div className="p-8">
                      <div className="text-center mb-8">
                          <span className="text-6xl font-black text-slate-800">{tempLimit}</span>
                          <span className="text-slate-400 font-bold ml-2">thẻ/ngày</span>
                      </div>

                      <div className="mb-8">
                          <input 
                              type="range" 
                              min="10" max="200" step="10"
                              value={tempLimit}
                              onChange={(e) => setTempLimit(parseInt(e.target.value))}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                          <div className="flex justify-between text-xs font-bold text-slate-400 mt-2">
                              <span>10 thẻ</span>
                              <span>200 thẻ</span>
                          </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-8">
                          <button onClick={() => setTempLimit(20)} className={`py-2 rounded-xl text-xs font-bold border ${tempLimit === 20 ? 'bg-green-100 border-green-500 text-green-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                              🌱 Nhẹ nhàng
                          </button>
                          <button onClick={() => setTempLimit(50)} className={`py-2 rounded-xl text-xs font-bold border ${tempLimit === 50 ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                              💧 Tiêu chuẩn
                          </button>
                          <button onClick={() => setTempLimit(100)} className={`py-2 rounded-xl text-xs font-bold border ${tempLimit === 100 ? 'bg-orange-100 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                              🔥 Chăm chỉ
                          </button>
                      </div>

                      <button 
                          onClick={handleSaveGoal}
                          className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 shadow-lg transition-all active:scale-95"
                      >
                          Lưu thay đổi
                      </button>
                      <button 
                          onClick={() => setShowGoalModal(false)}
                          className="w-full py-3 mt-3 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                      >
                          Đóng
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showForgottenModal && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-red-50">
                      <div>
                          <h3 className="font-bold text-xl text-red-800 flex items-center gap-2">
                              <span>⚠️</span> Thẻ cần ôn lại gấp
                          </h3>
                          <p className="text-xs text-red-600 mt-1">Các thẻ bạn đã đánh dấu "Quên" (Again). Hãy ôn tập để loại bỏ chúng khỏi danh sách này.</p>
                      </div>
                      <button onClick={() => setShowForgottenModal(false)} className="w-8 h-8 rounded-full bg-white/50 hover:bg-white text-red-500 font-bold flex items-center justify-center">✕</button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-0">
                      {forgottenCards.length === 0 ? (
                          <div className="p-10 text-center text-slate-400">Danh sách trống.</div>
                      ) : (
                          <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-50 text-xs font-bold text-slate-400 uppercase">
                                  <tr>
                                      <th className="px-6 py-3">Thuật ngữ</th>
                                      <th className="px-6 py-3">Nghĩa</th>
                                      <th className="px-6 py-3">Interval</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {forgottenCards.map(c => (
                                      <tr key={c.id}>
                                          <td className="px-6 py-3 font-bold text-slate-800">{c.term}</td>
                                          <td className="px-6 py-3 text-slate-600 text-sm">{c.meaning}</td>
                                          <td className="px-6 py-3 text-xs font-mono text-slate-400">{c.interval < 1 ? '<1d' : Math.round(c.interval) + 'd'}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                      <button onClick={() => setShowForgottenModal(false)} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Đóng</button>
                      <button 
                        onClick={() => {
                            setShowForgottenModal(false);
                            onReviewCards(forgottenCards);
                        }}
                        className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200"
                      >
                          Ôn tập ngay ({forgottenCards.length})
                      </button>
                  </div>
              </div>
           </div>
      )}
      
      {showCreateDeck && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 animate-in zoom-in-95">
                  <h3 className="font-bold text-xl text-slate-900 mb-6 text-center">Tạo bộ thẻ mới</h3>
                  <input 
                      autoFocus
                      value={newDeckName}
                      onChange={e => setNewDeckName(e.target.value)}
                      placeholder="VD: Từ vựng IELTS, Tiếng Nhật N5..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold mb-6 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-lg text-center"
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setShowCreateDeck(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Hủy</button>
                      <button onClick={handleCreateDeck} disabled={!newDeckName.trim()} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200 transition-all">Tạo ngay</button>
                  </div>
              </div>
          </div>
      )}

      {showImportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in-95">
                  <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-xl text-slate-900">Nhập từ Google Sheet</h3>
                      <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
                  </div>
                  
                  <div className="text-sm text-slate-500 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="mb-2"><strong>Yêu cầu cấu trúc File:</strong></p>
                      <ul className="list-disc list-inside space-y-1">
                          <li>Cột 1: <strong>Thuật ngữ</strong> (Từ vựng)</li>
                          <li>Cột 2: <strong>Phiên âm</strong> (Tùy chọn)</li>
                          <li>Cột 3: <strong>Loại từ</strong> (n, v, adj...)</li>
                          <li>Cột 4: <strong>Nghĩa</strong> (Tiếng Việt)</li>
                      </ul>
                      <p className="mt-3 text-xs italic text-indigo-600">* Nhớ bật chế độ chia sẻ: "Bất kỳ ai có đường liên kết"</p>
                  </div>

                  <div className="mb-6">
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Dán liên kết Google Sheet</label>
                      <input 
                          type="text" 
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                  </div>
                  
                  {importMsg && (
                      <div className={`mb-6 p-3 rounded-lg text-sm font-bold ${importStatus === 'error' ? 'bg-red-50 text-red-600' : importStatus === 'success' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                          {importMsg}
                      </div>
                  )}

                  <div className="flex gap-3">
                      <button onClick={() => setShowImportModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Đóng</button>
                      <button 
                        onClick={handleImportSheet} 
                        disabled={!importUrl.trim() || importStatus === 'loading'} 
                        className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200 transition-all"
                      >
                          {importStatus === 'loading' ? 'Đang xử lý...' : 'Nhập dữ liệu'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                          <h3 className="font-bold text-lg text-slate-800">Thêm thẻ mới</h3>
                          {selectedDeck && <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Vào: {selectedDeck.name}</span>}
                      </div>
                      <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-500 font-bold">✕</button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto space-y-5">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Từ vựng (Mặt trước)</label>
                          <input 
                            value={newTerm} onChange={e => setNewTerm(e.target.value)} 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                            placeholder="Hello"
                          />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Phiên âm</label>
                              <input value={newPhonetic} onChange={e => setNewPhonetic(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 font-mono text-sm" placeholder="/həˈləʊ/" />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nghĩa (Mặt sau)</label>
                              <input value={newMeaning} onChange={e => setNewMeaning(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 font-bold text-sm" placeholder="Xin chào" />
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Câu ví dụ / Ghi chú</label>
                          <textarea 
                            value={newExample} onChange={e => setNewExample(e.target.value)} 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm h-28 resize-none focus:ring-2 focus:ring-indigo-500 outline-none" 
                            placeholder="Hello world! (Xin chào thế giới)" 
                          ></textarea>
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-slate-50">
                      <button 
                        onClick={handleSaveCard} 
                        disabled={!newTerm || !newMeaning} 
                        className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg"
                      >
                          Lưu thẻ vào bộ
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};