
import React, { useState, useEffect } from 'react';
import { AnkiStats, Deck, Flashcard } from '../types';
import { getAnkiStats, createDeck, deleteDeck, getDueFlashcards, getDailyLimit, getDecks, importFlashcardsFromSheet } from '../services/flashcardService';

interface DashboardProps {
  onOpenFlashcards: (deckId?: string) => void;
  onReviewForgotten: () => void;
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
        className={`flex items-center p-5 rounded-[24px] border ${color} bg-white shadow-sm transition-all hover:scale-[1.03] ${onClick ? 'cursor-pointer active:scale-95' : ''}`}
    >
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-slate-50 mr-4 shadow-inner">
            {icon}
        </div>
        <div>
            <div className="text-2xl font-black text-slate-900">{value}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</div>
        </div>
    </div>
);

const DeckCard = ({ deck, stats, onClick, onDelete, onImport }: { deck: Deck, stats: any, onClick: () => void, onDelete: (e: any) => void, onImport: (e: any) => void }) => {
    const total = Math.max(stats?.counts.total || 1, 1);
    const mature = stats?.counts.mature || 0;
    const percent = Math.round((mature / total) * 100);

    return (
        <div 
            onClick={onClick}
            className="group relative bg-white rounded-[32px] border border-slate-200 p-6 cursor-pointer hover:shadow-2xl hover:border-indigo-400 transition-all duration-300 flex flex-col h-full"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 text-indigo-600 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                    🗂️
                </div>
                <div className="flex gap-2">
                    <button onClick={onImport} title="Import từ Google Sheet" className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-indigo-600 transition-all">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                    <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
            
            <h3 className="font-black text-xl text-slate-900 mb-1 line-clamp-1 group-hover:text-indigo-700 transition-colors">
                {deck.name}
            </h3>
            <p className="text-xs font-bold text-slate-400 mb-5 flex-1 uppercase tracking-widest">
                {stats ? `${stats.counts.total} thẻ vựng` : 'Đang tính toán...'}
            </p>

            <div className="w-full bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${percent}%` }}></div>
            </div>
            <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <span>Thuộc {percent}%</span>
                {stats && stats.due > 0 && <span className="text-red-500">+{stats.due} cần ôn</span>}
            </div>
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = ({ 
    onOpenFlashcards, onReviewForgotten, onReviewCards, syncKey, onSetSyncKey, onOpenAdmin, dueCount, isSyncing, onManualText
}) => {
  const [inputKey, setInputKey] = useState('');
  const [globalStats, setGlobalStats] = useState<AnkiStats | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckStatsMap, setDeckStatsMap] = useState<Record<string, any>>({});
  
  const [manualText, setManualText] = useState('');
  const [manualLang, setManualLang] = useState<'en' | 'zh'>('en');
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [isImporting, setIsImporting] = useState(false);

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

  const handleImportSheet = async (e: any, deckId: string) => {
      e.stopPropagation();
      const url = prompt("Dán link Google Sheet (Công khai) chứa từ vựng:");
      if (!url) return;
      
      setIsImporting(true);
      try {
          const result = await importFlashcardsFromSheet(url, deckId);
          if (result.error) alert(result.error);
          else alert(`Đã thêm thành công ${result.added} / ${result.total} từ vựng!`);
          refreshAllData();
      } catch (e) {
          alert("Lỗi khi import. Hãy chắc chắn link đúng định dạng.");
      } finally {
          setIsImporting(false);
      }
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
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
            <div className="bg-white rounded-[48px] p-10 md:p-16 shadow-2xl w-full max-w-5xl flex flex-col md:flex-row overflow-hidden relative border border-slate-100">
                <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
                <div className="flex-1 pr-0 md:pr-16 mb-12 md:mb-0 z-10">
                    <div className="inline-block p-4 rounded-[20px] bg-indigo-50 text-indigo-600 mb-8 text-4xl shadow-inner">🧠</div>
                    <h1 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">PaperLingo</h1>
                    <p className="text-slate-500 text-xl mb-12 leading-relaxed font-medium">Luyện dịch chuyên sâu & Ghi nhớ từ vựng SRS thủ công.</p>
                    
                    <form onSubmit={handleSyncLogin} className="space-y-6">
                        <input 
                            type="text" 
                            value={inputKey} 
                            onChange={(e) => setInputKey(e.target.value)} 
                            placeholder="Mã học viên..." 
                            className="w-full px-8 py-5 rounded-2xl bg-slate-50 border-2 border-slate-100 text-slate-900 font-black focus:border-indigo-500 focus:bg-white transition-all outline-none text-xl" 
                        />
                        <button type="submit" disabled={isSyncing} className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-2xl shadow-indigo-100 transition-all active:scale-95 text-xl hover:bg-indigo-700">
                            {isSyncing ? 'Đang xác thực...' : 'Bắt đầu học ngay'}
                        </button>
                    </form>
                    <div className="mt-12 pt-10 border-t border-slate-100 flex flex-col items-center">
                        <button onClick={onOpenAdmin} className="text-slate-400 font-black text-xs uppercase tracking-widest hover:text-indigo-600">🛡️ Quản trị hệ thống</button>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-12 min-h-screen animate-in fade-in duration-700">
      {(isImporting) && (
          <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mb-4"></div>
                  <div className="font-bold text-slate-600">Đang đồng bộ dữ liệu...</div>
              </div>
          </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-center mb-16 gap-6">
          <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-2xl shadow-2xl shadow-slate-200">{syncKey.charAt(0).toUpperCase()}</div>
              <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">PaperLingo</h1>
                  <p className="text-xs text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Dịch thuật & Ghi nhớ SRS</p>
              </div>
          </div>
          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
              <button onClick={onOpenAdmin} className="text-slate-400 hover:text-indigo-600 font-black text-[10px] px-4 uppercase tracking-widest">Admin</button>
              <button onClick={() => { if(confirm('Đăng xuất?')) onSetSyncKey(''); }} className="px-6 py-3 rounded-xl bg-red-50 text-red-600 font-black hover:bg-red-100 transition-all text-[10px] uppercase tracking-widest">Đăng xuất</button>
          </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8 space-y-12">
              
              {/* PRIMARY INPUT AREA */}
              <div className="bg-white rounded-[48px] p-10 border border-slate-200 shadow-xl shadow-indigo-100/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-10 text-slate-100 text-9xl font-black select-none pointer-events-none">TEXT</div>
                  <div className="relative z-10">
                      <div className="flex items-center justify-between mb-8">
                          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                            <span className="bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center text-sm shadow-lg shadow-indigo-100">✍️</span>
                            LUYỆN DỊCH VĂN BẢN
                          </h2>
                          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                              <button onClick={() => setManualLang('en')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${manualLang === 'en' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>🇬🇧 English</button>
                              <button onClick={() => setManualLang('zh')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${manualLang === 'zh' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>🇨🇳 Chinese</button>
                          </div>
                      </div>
                      <textarea 
                          value={manualText}
                          onChange={(e) => setManualText(e.target.value)}
                          placeholder="Dán nội dung bài báo hoặc đoạn văn cần luyện dịch tại đây..."
                          className="w-full h-80 p-8 rounded-[32px] border-2 border-slate-100 bg-slate-50/50 focus:bg-white focus:border-indigo-500 outline-none text-xl leading-relaxed resize-none mb-6 placeholder:text-slate-300 transition-all"
                      />
                      <button 
                          onClick={handleStartLesson}
                          disabled={!manualText.trim()}
                          className="w-full py-7 bg-slate-900 text-white font-black rounded-[28px] hover:bg-slate-800 disabled:opacity-20 transition-all shadow-2xl shadow-slate-200 text-xl flex items-center justify-center gap-3 active:scale-95"
                      >
                          BẮT ĐẦU LUYỆN DỊCH →
                      </button>
                  </div>
              </div>

              {/* DECKS AREA */}
              <div>
                  <div className="flex justify-between items-end mb-8 px-4">
                      <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <span className="bg-emerald-500 text-white w-10 h-10 rounded-xl flex items-center justify-center text-sm shadow-lg shadow-emerald-100">📚</span>
                        BỘ THẺ TỪ VỰNG
                      </h2>
                      <button onClick={() => setShowCreateDeck(true)} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-6 py-2.5 rounded-full uppercase tracking-widest hover:bg-indigo-100 transition-all">+ Tạo bộ mới</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {decks.map(deck => (
                          <DeckCard 
                            key={deck.id} 
                            deck={deck} 
                            stats={deckStatsMap[deck.id]} 
                            onClick={() => onOpenFlashcards(deck.id)} 
                            onDelete={(e) => handleDeleteDeck(e, deck.id)}
                            onImport={(e) => handleImportSheet(e, deck.id)}
                          />
                      ))}
                      {decks.length === 0 && (
                          <div className="md:col-span-2 py-20 border-2 border-dashed border-slate-100 rounded-[48px] text-center bg-white text-slate-400 font-bold uppercase text-xs">Chưa có bộ thẻ vựng. Hãy tạo bộ thẻ đầu tiên!</div>
                      )}
                  </div>
              </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
              <div className="bg-white rounded-[48px] border border-slate-200 p-8 shadow-2xl shadow-slate-100 sticky top-10">
                  <h3 className="font-black text-slate-900 text-xl mb-10 flex items-center gap-3">
                    <span className="bg-blue-500 text-white w-8 h-8 rounded-lg flex items-center justify-center text-xs shadow-lg shadow-blue-100">📊</span>
                    TIẾN TRÌNH HỌC
                  </h3>
                  {globalStats && (
                      <div className="space-y-5">
                            <StatCard label="Cần ôn lại" value={dueCount} color="border-indigo-100" icon="🔥" onClick={() => onOpenFlashcards()} />
                            <StatCard label="Từ bị quên" value={globalStats.forgotten} color="border-rose-100" icon="⚠️" onClick={onReviewForgotten} />
                            <StatCard label="Đã học hôm nay" value={globalStats.today.studied} color="border-emerald-100" icon="📝" />
                      </div>
                  )}
                  <div className="mt-12 pt-8 border-t border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Mục tiêu ngày</p>
                      <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden border border-slate-100">
                          <div 
                            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-1000" 
                            style={{ width: `${Math.min(100, ((globalStats?.today.studied || 0) / getDailyLimit()) * 100)}%` }}
                          />
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {showCreateDeck && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border border-white text-center">
                  <h3 className="font-black text-2xl mb-8 text-slate-900">Tạo bộ thẻ mới</h3>
                  <input value={newDeckName} onChange={e => setNewDeckName(e.target.value)} placeholder="Tên bộ thẻ..." className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 font-black mb-10 outline-none text-center focus:border-indigo-500 transition-all text-xl" autoFocus />
                  <div className="flex gap-4">
                      <button onClick={() => setShowCreateDeck(false)} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Hủy</button>
                      <button onClick={handleCreateDeck} className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all text-[10px] uppercase">Tạo ngay</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
