
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
  isSyncing: boolean;
  onManualText: (text: string, language: 'en' | 'zh') => void;
}

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
    const total = Math.max(stats?.counts.total || 1, 1);
    const mature = stats?.counts.mature || 0;
    const percent = Math.round((mature / total) * 100);

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

            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2 overflow-hidden">
                <div className="bg-green-500 h-full rounded-full transition-all duration-1000" style={{ width: `${percent}%` }}></div>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                <span>Thành thạo {percent}%</span>
            </div>

            {stats && stats.due > 0 && (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">
                    {stats.due}
                </div>
            )}
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = ({ 
    onOpenFlashcards, onReviewCards, syncKey, onSetSyncKey, onOpenAdmin, dueCount, isSyncing, onManualText
}) => {
  const [inputKey, setInputKey] = useState('');
  const [globalStats, setGlobalStats] = useState<AnkiStats | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckStatsMap, setDeckStatsMap] = useState<Record<string, any>>({});
  
  // Lesson Input State
  const [manualText, setManualText] = useState('');
  const [manualLang, setManualLang] = useState<'en' | 'zh'>('en');

  // Modals
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');

  useEffect(() => {
      if (!isSyncing && syncKey) refreshAllData();
  }, [syncKey, dueCount, isSyncing]);

  const refreshAllData = async () => {
      try {
          const gStats = await getAnkiStats();
          setGlobalStats(gStats);
          const dList = await getDecks();
          setDecks(dList);
          const dStats: Record<string, any> = {};
          for (const d of dList) {
              const s = await getAnkiStats(d.id);
              const due = await getDueFlashcards(d.id);
              dStats[d.id] = { ...s, due: due.length };
          }
          setDeckStatsMap(dStats);
      } catch (e) { console.error(e); }
  };

  const handleSyncLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if(inputKey.trim()) onSetSyncKey(inputKey.trim());
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
      if(confirm('Xóa bộ thẻ này?')) {
          await deleteDeck(id);
          refreshAllData();
      }
  };

  const handleStartLesson = () => {
      if (!manualText.trim()) return;
      onManualText(manualText, manualLang);
      setManualText('');
  };

  if (!syncKey) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
            <div className="bg-white rounded-[32px] p-8 md:p-12 shadow-2xl w-full max-w-4xl flex flex-col md:flex-row overflow-hidden relative border border-slate-100">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
                <div className="flex-1 pr-0 md:pr-12 mb-8 md:mb-0 z-10">
                    <div className="inline-block p-3 rounded-2xl bg-indigo-50 text-indigo-600 mb-6 text-3xl">🧠</div>
                    <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">PaperLingo</h1>
                    <p className="text-slate-500 text-lg mb-8 leading-relaxed">Hệ thống luyện dịch và học từ vựng SRS thông minh.</p>
                    
                    <form onSubmit={handleSyncLogin} className="space-y-4">
                        <div className="relative">
                            <input 
                                type="text" 
                                value={inputKey} 
                                onChange={(e) => setInputKey(e.target.value)} 
                                placeholder="Mã học viên của bạn..." 
                                className="w-full px-6 py-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none" 
                            />
                        </div>
                        <button type="submit" disabled={isSyncing} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 text-lg hover:bg-indigo-700">
                            {isSyncing ? 'Đang vào...' : 'Bắt đầu ngay'}
                        </button>
                    </form>

                    <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col items-center">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">Dành cho Giáo viên</p>
                        <button 
                            onClick={onOpenAdmin}
                            className="flex items-center gap-2 px-6 py-2 rounded-full border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 transition-all group"
                        >
                            <span className="text-lg group-hover:rotate-12 transition-transform">🛡️</span>
                            Quản trị viên
                        </button>
                    </div>
                </div>
                
                <div className="hidden md:flex flex-1 bg-slate-50 rounded-2xl p-8 flex-col justify-center items-center text-center">
                    <div className="text-6xl mb-6">🚀</div>
                    <h3 className="font-bold text-slate-800 text-xl mb-2">Học tập không giới hạn</h3>
                    <p className="text-slate-400 text-sm">Dữ liệu của bạn được đồng bộ hóa tức thì trên mọi thiết bị thông qua Mã học viên.</p>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-200">{syncKey.charAt(0).toUpperCase()}</div>
              <div>
                  <h1 className="text-2xl font-black text-slate-900">PaperLingo</h1>
                  <p className="text-sm text-slate-500 font-medium">Luyện dịch Anh - Trung theo cách của bạn.</p>
              </div>
          </div>
          <div className="flex items-center gap-3">
              <button onClick={onOpenAdmin} className="text-slate-400 hover:text-slate-600 font-bold text-sm px-4">Admin</button>
              <button onClick={() => { if(confirm('Đăng xuất?')) onSetSyncKey(''); }} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-red-500 transition-colors text-sm">Đăng xuất</button>
          </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
              {/* NEW PRIMARY ACTION AREA */}
              <div className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><span>✍️</span> Luyện dịch mới</h2>
                      <div className="flex bg-slate-100 p-1 rounded-lg">
                          <button onClick={() => setManualLang('en')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${manualLang === 'en' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>🇺🇸 English</button>
                          <button onClick={() => setManualLang('zh')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${manualLang === 'zh' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>🇨🇳 Chinese</button>
                      </div>
                  </div>
                  <textarea 
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Dán đoạn văn bản cần dịch vào đây..."
                      className="w-full h-48 p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-lg resize-none mb-4"
                  />
                  <button 
                      onClick={handleStartLesson}
                      disabled={!manualText.trim()}
                      className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg text-lg flex items-center justify-center gap-2"
                  >
                      Bắt đầu bài dịch
                  </button>
              </div>

              <div>
                  <div className="flex justify-between items-end mb-6">
                      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><span>📚</span> Bộ thẻ vựng</h2>
                      <button onClick={() => setShowCreateDeck(true)} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg">+ Tạo bộ mới</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {decks.map(deck => (
                          <DeckCard key={deck.id} deck={deck} stats={deckStatsMap[deck.id]} onClick={() => onOpenFlashcards(deck.id)} onDelete={(e) => handleDeleteDeck(e, deck.id)} />
                      ))}
                      {decks.length === 0 && (
                          <div className="md:col-span-2 py-12 border-2 border-dashed border-slate-200 rounded-[32px] text-center text-slate-400">
                              <p className="font-bold mb-2">Chưa có bộ thẻ nào.</p>
                              <p className="text-xs">Hãy tạo bộ thẻ để lưu từ vựng khi đang dịch.</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm sticky top-6">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><span>📊</span> Thống kê học tập</h3>
                  {globalStats && (
                      <div className="space-y-4">
                            <StatCard label="Cần ôn tập" value={dueCount} color="border-indigo-100" icon="🔥" onClick={() => onOpenFlashcards()} />
                            <StatCard label="Đã học hôm nay" value={globalStats.today.studied} color="border-blue-100" icon="📝" />
                            <StatCard label="Thẻ bị quên" value={globalStats.forgotten} color="border-red-100" icon="⚠️" />
                      </div>
                  )}
                  <div className="mt-8 pt-6 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Mục tiêu ngày</p>
                      <div className="flex items-center justify-between font-bold text-slate-700">
                          <span>{globalStats?.today.studied || 0} / {getDailyLimit()} thẻ</span>
                          <span className="text-indigo-600">
                              {Math.round(((globalStats?.today.studied || 0) / getDailyLimit()) * 100)}%
                          </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-full transition-all duration-1000" 
                            style={{ width: `${Math.min(100, ((globalStats?.today.studied || 0) / getDailyLimit()) * 100)}%` }}
                          />
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {showCreateDeck && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl">
                  <h3 className="font-bold text-xl mb-6 text-center">Tạo bộ thẻ mới</h3>
                  <input value={newDeckName} onChange={e => setNewDeckName(e.target.value)} placeholder="Tên bộ thẻ..." className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold mb-6 outline-none text-center" />
                  <div className="flex gap-3">
                      <button onClick={() => setShowCreateDeck(false)} className="flex-1 py-3 text-slate-500">Hủy</button>
                      <button onClick={handleCreateDeck} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl">Tạo</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
