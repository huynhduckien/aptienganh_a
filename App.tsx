
import React, { useState, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { LessonView } from './components/LessonView';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel'; // Import AdminPanel
import { chunkTextByLevel, DifficultyLevel } from './services/pdfService';
import { ProcessedChunk, SavedPaper, Flashcard } from './types';
import { saveFlashcard, getDueFlashcards, getFlashcards, setSyncKeyAndSync } from './services/flashcardService';
import { FlashcardReview } from './components/FlashcardReview';
import { savePaperToDB, getAllPapersFromDB, updatePaperProgress, deletePaperFromDB, generateId } from './services/db';
import { verifyStudentKey } from './services/firebaseService';

type AppState = 'dashboard' | 'upload' | 'level_select' | 'study';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('dashboard');
  
  // Paper Data
  const [papers, setPapers] = useState<SavedPaper[]>([]);
  const [currentPaperId, setCurrentPaperId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [chunks, setChunks] = useState<ProcessedChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);

  // Tools Data
  const [dictionary, setDictionary] = useState<{term: string, meaning: string, explanation: string, phonetic: string} | null>(null);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false); // State for Admin Panel
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'exists'>('idle');
  
  // Sync Data
  const [syncKey, setSyncKey] = useState<string | null>(null);

  // Load papers and flashcards on init
  useEffect(() => {
    // 1. Check local storage for sync key
    const storedKey = localStorage.getItem('paperlingo_sync_key');
    if (storedKey) {
        setSyncKey(storedKey);
        setSyncKeyAndSync(storedKey).then(() => {
            updateDueCount();
        });
    }

    loadPapers();
    
    // Fallback local load if no sync key yet
    if (!storedKey) {
        getFlashcards().then(() => updateDueCount());
    }
    
    const interval = setInterval(updateDueCount, 60000);
    return () => clearInterval(interval);
  }, []);

  // Handle Sync Key Change
  const handleSetSyncKey = async (key: string) => {
      if (!key) {
          // Logout logic
          localStorage.removeItem('paperlingo_sync_key');
          setSyncKey(null);
          window.location.reload(); // Refresh to clear memory state
          return;
      }

      // Verify key exists (optional security check)
      const isValid = await verifyStudentKey(key);
      if (!isValid) {
          alert("Mã học viên không hợp lệ hoặc không tồn tại!");
          return;
      }

      setSyncKey(key);
      localStorage.setItem('paperlingo_sync_key', key);
      await setSyncKeyAndSync(key);
      await updateDueCount();
      alert(`Đã kích hoạt tài khoản: ${isValid.name}`);
  };

  const loadPapers = async () => {
    try {
        const savedPapers = await getAllPapersFromDB();
        setPapers(savedPapers);
    } catch (e) {
        console.error("Failed to load papers", e);
    }
  };

  const updateDueCount = async () => {
    const due = await getDueFlashcards();
    setDueCards(due);
  };

  const handleTextExtracted = (text: string, name: string) => {
    setRawText(text);
    setFileName(name);
    setAppState('level_select');
  };

  const startLearning = async (level: DifficultyLevel) => {
    const textChunks = chunkTextByLevel(rawText, level);
    const initialChunks: ProcessedChunk[] = textChunks.map((t, idx) => ({
      id: idx,
      text: t,
      isCompleted: false
    }));

    const newPaper: SavedPaper = {
        id: generateId(),
        fileName: fileName,
        originalText: rawText,
        processedChunks: initialChunks,
        currentChunkIndex: 0,
        createdAt: Date.now(),
        lastOpened: Date.now()
    };

    await savePaperToDB(newPaper);
    
    setPapers(prev => [newPaper, ...prev]);
    setCurrentPaperId(newPaper.id);
    setChunks(initialChunks);
    setCurrentChunkIndex(0);
    setAppState('study');
    setDictionary(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openSavedPaper = async (paper: SavedPaper) => {
    setRawText(paper.originalText);
    setFileName(paper.fileName);
    setChunks(paper.processedChunks);
    setCurrentChunkIndex(paper.currentChunkIndex);
    setCurrentPaperId(paper.id);
    
    await updatePaperProgress(paper.id, paper.processedChunks, paper.currentChunkIndex);
    loadPapers(); 
    
    setAppState('study');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeletePaper = async (id: string) => {
      if (window.confirm("Bạn có chắc chắn muốn xóa bài báo này?")) {
          // Optimistic UI update
          setPapers(prev => prev.filter(p => p.id !== id));

          try {
              await deletePaperFromDB(id);
          } catch (error) {
              console.error("Failed to delete paper", error);
              alert("Không thể xóa bài báo. Vui lòng thử lại.");
              loadPapers(); 
          }
      }
  };

  const handleChunkComplete = (chunkId: number) => {
    const newChunks = chunks.map(c => c.id === chunkId ? { ...c, isCompleted: true } : c);
    setChunks(newChunks);
    if (currentPaperId) {
        updatePaperProgress(currentPaperId, newChunks, currentChunkIndex);
    }
  };

  const handleNext = () => {
    if (currentChunkIndex < chunks.length - 1) {
      const nextIndex = currentChunkIndex + 1;
      setCurrentChunkIndex(nextIndex);
      setDictionary(null);
      setSaveStatus('idle');
      if (currentPaperId) {
          updatePaperProgress(currentPaperId, chunks, nextIndex);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToChunk = (index: number) => {
      setCurrentChunkIndex(index);
      setDictionary(null);
      setSaveStatus('idle');
      if (currentPaperId) {
        updatePaperProgress(currentPaperId, chunks, index);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSaveFlashcard = async () => {
    if (!dictionary) return;
    const success = await saveFlashcard({
      term: dictionary.term,
      meaning: dictionary.meaning,
      explanation: dictionary.explanation,
      phonetic: dictionary.phonetic
    });
    setSaveStatus(success ? 'saved' : 'exists');
    updateDueCount();
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans selection:bg-sky-100">
      {/* Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-20">
        <div className="w-full max-w-[98%] xl:max-w-[1900px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer group" 
              onClick={() => {
                  setAppState('dashboard');
                  loadPapers();
              }}
            >
              <div className="bg-slate-900 text-white p-1.5 rounded-lg group-hover:bg-sky-600 transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-900">PaperLingo</span>
              {syncKey && (
                  <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-mono hidden sm:block">
                      {syncKey}
                  </span>
              )}
            </div>

            <div className="flex items-center gap-4">
                 {appState === 'study' && (
                     <div className="hidden md:block px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-500 max-w-[200px] truncate">
                        {fileName}
                     </div>
                 )}
                 {dueCards.length > 0 && (
                    <button 
                      onClick={() => setShowFlashcards(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-full hover:bg-red-100 transition-colors"
                    >
                       <span>Review</span>
                       <span className="bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">{dueCards.length}</span>
                    </button>
                 )}
            </div>
        </div>
      </header>

      <main className="w-full max-w-[98%] xl:max-w-[1900px] mx-auto px-4 sm:px-6 py-6 md:py-8">
        
        {appState === 'dashboard' && (
            <Dashboard 
                papers={papers}
                onOpenPaper={openSavedPaper}
                onDeletePaper={handleDeletePaper}
                onNewPaper={() => setAppState('upload')}
                onOpenFlashcards={() => setShowFlashcards(true)}
                syncKey={syncKey}
                onSetSyncKey={handleSetSyncKey}
                onOpenAdmin={() => setShowAdmin(true)}
            />
        )}

        {appState === 'upload' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            <button 
                onClick={() => setAppState('dashboard')} 
                className="absolute top-0 left-4 text-slate-400 hover:text-slate-600 font-bold z-10"
            >
                ← Quay lại Dashboard
            </button>
            <FileUpload onTextExtracted={handleTextExtracted} />
          </div>
        )}

        {appState === 'level_select' && (
           <div className="max-w-3xl mx-auto text-center py-12 animate-in fade-in zoom-in duration-300">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">Chọn cấp độ phù hợp</h2>
              <p className="text-slate-500 mb-12">Chia nhỏ bài báo thành các đoạn ngắn để dễ dàng tiếp thu.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <button 
                    onClick={() => startLearning('medium')}
                    className="group bg-white p-8 rounded-2xl border border-gray-200 hover:border-sky-500 hover:shadow-lg transition-all text-left"
                  >
                      <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h10"/><path d="M9 4v16"/><path d="m3 9 3 3-3 3"/><path d="M14 8V7c0-1.1.9-2 2-2h6"/><path d="M14 12v-1c0-1.1.9-2 2-2h6"/><path d="M14 16v-1c0-1.1.9-2 2-2h6"/></svg>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">Vừa phải</h3>
                      <p className="text-sm text-slate-500">2-3 câu mỗi đoạn. Phù hợp để nắm bắt ý chính.</p>
                  </button>

                  <button 
                    onClick={() => startLearning('hard')}
                    className="group bg-white p-8 rounded-2xl border border-gray-200 hover:border-violet-500 hover:shadow-lg transition-all text-left"
                  >
                       <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">Nâng cao</h3>
                      <p className="text-sm text-slate-500">4-6 câu. Thử thách khả năng đọc hiểu sâu.</p>
                  </button>
              </div>
           </div>
        )}

        {appState === 'study' && (
          <div className="flex flex-col lg:flex-row gap-6 xl:gap-8 items-start">
            
            <div className="flex-1 w-full min-w-0">
               <div className="flex items-center justify-between mb-4">
                 <button onClick={() => { setAppState('dashboard'); loadPapers(); }} className="text-sm font-bold text-slate-400 hover:text-slate-600">
                    ← Thư viện
                 </button>
                 <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                    Đoạn {currentChunkIndex + 1} / {chunks.length}
                 </div>
               </div>
              
              <LessonView 
                chunk={chunks[currentChunkIndex]}
                totalChunks={chunks.length}
                onComplete={handleChunkComplete}
                onNext={handleNext}
                onLookup={(term, meaning, explanation, phonetic) => {
                    setDictionary({term, meaning, explanation, phonetic});
                    setSaveStatus('idle');
                }}
                isLast={currentChunkIndex === chunks.length - 1}
              />
            </div>

            <div className="hidden lg:block w-80 xl:w-96 sticky top-24 shrink-0 space-y-4">
               
               {dictionary ? (
                   <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-[0_4px_20px_-4px_rgba(14,165,233,0.15)] relative animate-in slide-in-from-right duration-300 ring-1 ring-indigo-500/10 flex flex-col gap-6">
                        <button 
                            onClick={() => setDictionary(null)}
                            className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 p-1 transition-colors"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                        
                        <div className="border-b border-slate-100 pb-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Từ vựng</span>
                            <div className="flex items-baseline justify-between">
                                <h3 className="font-serif text-3xl font-bold text-slate-900 break-words tracking-tight leading-tight">{dictionary.term}</h3>
                                <button 
                                    onClick={() => playAudio(dictionary.term)}
                                    className="text-indigo-400 hover:text-indigo-600 transition-colors p-1"
                                    title="Phát âm"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                </button>
                            </div>
                        </div>

                        {dictionary.phonetic && (
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Phiên âm</span>
                                <div className="bg-slate-50 p-2 rounded-lg inline-block border border-slate-100">
                                    <span className="text-lg font-mono text-slate-600 tracking-wide">
                                        /{dictionary.phonetic}/
                                    </span>
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Giải thích</span>
                            <div className="text-sm text-slate-700 leading-relaxed bg-indigo-50/50 p-4 rounded-xl border border-indigo-50 whitespace-pre-line">
                                {dictionary.explanation}
                            </div>
                        </div>

                        <button 
                            onClick={handleSaveFlashcard}
                            disabled={saveStatus !== 'idle'}
                            className={`w-full py-3 rounded-xl text-sm font-bold transition-all mt-2 shadow-sm ${
                                saveStatus === 'saved' ? 'bg-green-100 text-green-700' :
                                saveStatus === 'exists' ? 'bg-amber-50 text-amber-600' :
                                'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                        >
                            {saveStatus === 'saved' ? 'Đã lưu thành công' : 
                             saveStatus === 'exists' ? 'Từ này đã có' : 'Lưu vào Flashcard'}
                        </button>
                   </div>
               ) : (
                   <div className="bg-white/50 border border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center h-[300px] text-slate-400">
                       <span className="text-4xl mb-3 opacity-50">👆</span>
                       <p className="text-sm font-medium">Bôi đen bất kỳ từ nào trong bài đọc<br/>để xem giải thích chi tiết tại đây.</p>
                   </div>
               )}

               <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col max-h-[50vh]">
                  <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-slate-400 uppercase">Mục lục</span>
                      <div className="text-xs font-medium text-slate-500">{chunks.filter(c=>c.isCompleted).length}/{chunks.length} hoàn thành</div>
                  </div>
                  
                  <div className="grid grid-cols-5 gap-2 overflow-y-auto pr-2 custom-scrollbar">
                      {chunks.map((chunk, idx) => {
                          let statusClass = "bg-gray-50 text-gray-400 hover:bg-gray-100 border-gray-100";
                          if (chunk.isCompleted) statusClass = "bg-emerald-50 text-emerald-600 border-emerald-100 font-medium";
                          if (idx === currentChunkIndex) statusClass = "bg-slate-900 text-white border-slate-900 font-bold ring-2 ring-slate-200 ring-offset-2";

                          return (
                              <button
                                key={chunk.id}
                                onClick={() => handleJumpToChunk(idx)}
                                className={`aspect-square flex items-center justify-center rounded-lg text-xs border transition-all ${statusClass}`}
                              >
                                {idx + 1}
                              </button>
                          )
                      })}
                  </div>
               </div>
            </div>
          </div>
        )}
      </main>

      {showFlashcards && (
        <FlashcardReview 
            cards={dueCards} 
            onClose={() => setShowFlashcards(false)}
            onUpdate={updateDueCount}
        />
      )}

      {showAdmin && (
          <AdminPanel onClose={() => setShowAdmin(false)} />
      )}
    </div>
  );
};

export default App;