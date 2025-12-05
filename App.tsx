import React, { useState, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { LessonView } from './components/LessonView';
import { chunkTextByLevel, DifficultyLevel } from './services/pdfService';
import { ProcessedChunk } from './types';
import { saveFlashcard, getDueFlashcards } from './services/flashcardService';
import { FlashcardReview } from './components/FlashcardReview';

const App: React.FC = () => {
  const [chunks, setChunks] = useState<ProcessedChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [fileName, setFileName] = useState<string>('');
  
  // State machine: 'upload' -> 'level_select' -> 'study'
  const [appState, setAppState] = useState<'upload' | 'level_select' | 'study'>('upload');
  const [rawText, setRawText] = useState<string>('');

  // Dictionary state for sidebar
  const [dictionary, setDictionary] = useState<{term: string, meaning: string, explanation: string, phonetic: string} | null>(null);

  // Flashcard State
  const [dueCardsCount, setDueCardsCount] = useState(0);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'exists'>('idle');

  useEffect(() => {
    updateDueCount();
    // Check periodically
    const interval = setInterval(updateDueCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const updateDueCount = () => {
    const due = getDueFlashcards();
    setDueCardsCount(due.length);
  };

  const handleTextExtracted = (text: string, name: string) => {
    setRawText(text);
    setFileName(name);
    setAppState('level_select');
  };

  const startLearning = (level: DifficultyLevel) => {
    const textChunks = chunkTextByLevel(rawText, level);
    
    const initialChunks: ProcessedChunk[] = textChunks.map((t, idx) => ({
      id: idx,
      text: t,
      isCompleted: false
    }));

    setChunks(initialChunks);
    setCurrentChunkIndex(0);
    setAppState('study');
    setDictionary(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChunkComplete = (chunkId: number) => {
    setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, isCompleted: true } : c));
  };

  const handleNext = () => {
    if (currentChunkIndex < chunks.length - 1) {
      setCurrentChunkIndex(prev => prev + 1);
      setDictionary(null);
      setSaveStatus('idle');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToChunk = (index: number) => {
      setCurrentChunkIndex(index);
      setDictionary(null);
      setSaveStatus('idle');
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

  const handleSaveFlashcard = () => {
    if (!dictionary) return;
    const success = saveFlashcard({
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
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12 font-sans">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm h-16">
        <div className="w-full px-6 md:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center cursor-pointer" onClick={() => setAppState('upload')}>
              <span className="text-2xl mr-2">📄</span>
              <span className="font-bold text-xl text-slate-800">PaperLingo</span>
            </div>
            {appState === 'study' && (
              <div className="text-sm font-medium text-slate-500 truncate max-w-xs hidden sm:block">
                {fileName}
              </div>
            )}
            <div className="hidden sm:flex items-center space-x-4">
                 <button className="text-slate-400 hover:text-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                 </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content - Full Width */}
      <main className="w-full px-4 md:px-8 mt-6 relative mb-12">
        
        {/* Upload State */}
        {appState === 'upload' && (
          <FileUpload onTextExtracted={handleTextExtracted} />
        )}

        {/* Level Select State */}
        {appState === 'level_select' && (
           <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in zoom-in duration-300">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">Chọn cấp độ luyện dịch</h2>
              <p className="text-slate-500 mb-10">Bài học được chia nhỏ để tránh bị ngợp (Micro-learning).</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                  {/* Medium */}
                  <button 
                    onClick={() => startLearning('medium')}
                    className="group bg-white p-8 rounded-3xl border-2 border-slate-100 hover:border-blue-400 hover:shadow-xl transition-all text-left relative overflow-hidden"
                  >
                      <div className="absolute top-0 left-0 w-2 h-full bg-blue-400"></div>
                      <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">🌿</div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Vừa phải (Đoạn ngắn)</h3>
                      <p className="text-sm text-slate-500">2 - 3 câu mỗi đoạn. Đủ ngữ cảnh nhưng vẫn ngắn gọn.</p>
                  </button>

                  {/* Hard */}
                  <button 
                    onClick={() => startLearning('hard')}
                    className="group bg-white p-8 rounded-3xl border-2 border-slate-100 hover:border-purple-400 hover:shadow-xl transition-all text-left relative overflow-hidden"
                  >
                      <div className="absolute top-0 left-0 w-2 h-full bg-purple-400"></div>
                      <div className="text-4xl mb-4 group-hover:scale-110 transition-transform origin-left">🌳</div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Nâng cao (4-6 câu)</h3>
                      <p className="text-sm text-slate-500">Khoảng 4-6 câu. Thử thách khả năng liên kết đoạn văn.</p>
                  </button>
              </div>

               <button 
                  onClick={() => setAppState('upload')}
                  className="mt-12 text-slate-400 hover:text-slate-600 underline"
               >
                  Quay lại chọn file
               </button>
           </div>
        )}

        {/* Study State - Expanded Layout */}
        {appState === 'study' && (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            
            {/* Main Lesson Area - Takes remaining width */}
            <div className="flex-1 w-full min-w-0">
              <div className="mb-6 flex items-baseline justify-between">
                 <h1 className="text-xl font-bold text-slate-800">
                    Phần {currentChunkIndex + 1} <span className="text-slate-400 font-normal">/ {chunks.length}</span>
                 </h1>
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

            {/* Sidebar (Desktop) */}
            <div className="hidden lg:block w-80 sticky top-24 shrink-0 space-y-6">
               
               {/* Dictionary Card */}
               {dictionary && (
                   <div className="bg-[#f0fdf4] p-6 rounded-2xl border border-green-200 shadow-sm relative animate-in slide-in-from-right duration-300">
                        <button 
                            onClick={() => setDictionary(null)}
                            className="absolute top-3 right-3 text-green-700/50 hover:bg-green-100 hover:text-green-800 p-1.5 rounded-full transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        
                        <div className="flex flex-col gap-1 mb-3">
                             <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => playAudio(dictionary.term)}
                                    className="text-2xl hover:scale-110 active:scale-95 transition-transform cursor-pointer rounded-full hover:bg-green-100 p-1 flex items-center justify-center"
                                    title="Nghe phát âm"
                                >
                                    🔊
                                </button>
                                <h3 className="font-serif text-xl font-bold text-green-800">{dictionary.term}</h3>
                             </div>
                             {dictionary.phonetic && (
                                <span className="text-sm font-normal text-slate-500 ml-10">/{dictionary.phonetic}/</span>
                             )}
                        </div>
                        
                        <div className="text-green-900 leading-relaxed font-bold mb-2">
                            {dictionary.meaning}
                        </div>
                        <div className="text-slate-600 text-sm leading-relaxed border-t border-green-200 pt-2 mb-4">
                            {dictionary.explanation}
                        </div>

                        {/* Save Flashcard Button */}
                        <button 
                            onClick={handleSaveFlashcard}
                            disabled={saveStatus !== 'idle'}
                            className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all shadow-sm ${
                                saveStatus === 'saved' ? 'bg-green-100 text-green-700' :
                                saveStatus === 'exists' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-white border-2 border-green-200 text-green-700 hover:bg-green-50'
                            }`}
                        >
                             <span>
                                {saveStatus === 'saved' ? 'Đã lưu' : 
                                 saveStatus === 'exists' ? 'Đã có trong bộ từ' : '⭐ Lưu vào Flashcard'}
                             </span>
                        </button>
                   </div>
               )}

               {/* Progress Widget - SCROLLABLE */}
               <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col max-h-[calc(100vh-200px)]">
                  <div className="flex items-center justify-between mb-3 shrink-0">
                      <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tiến độ bài học</h2>
                      
                      {/* REVIEW BUTTON */}
                      {dueCardsCount > 0 && (
                          <button 
                            onClick={() => setShowFlashcards(true)}
                            className="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded-full border border-red-100 hover:bg-red-100 flex items-center gap-1 animate-pulse"
                          >
                             <span>📚 Ôn tập:</span>
                             <span className="bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px]">{dueCardsCount}</span>
                          </button>
                      )}
                      {dueCardsCount === 0 && (
                         <button 
                            onClick={() => setShowFlashcards(true)}
                            className="text-slate-400 hover:text-indigo-600 text-[10px] font-bold flex items-center gap-1"
                         >
                            <span>📚 Kho từ vựng</span>
                         </button>
                      )}
                  </div>
                  
                  <div className="grid grid-cols-5 gap-1.5 overflow-y-auto pr-1">
                      {chunks.map((chunk, idx) => {
                          let bgClass = "bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-100";
                          if (chunk.isCompleted) bgClass = "bg-green-50 text-green-600 border border-green-200 font-bold";
                          if (idx === currentChunkIndex) bgClass = "bg-indigo-600 text-white shadow-md border border-indigo-600 font-bold";

                          return (
                              <button
                                key={chunk.id}
                                onClick={() => handleJumpToChunk(idx)}
                                className={`w-full aspect-square flex items-center justify-center rounded text-[10px] transition-all ${bgClass}`}
                              >
                                {idx + 1}
                              </button>
                          )
                      })}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 shrink-0">
                    <button 
                        onClick={() => setAppState('level_select')}
                        className="w-full text-xs text-slate-600 hover:bg-slate-50 py-2 rounded border border-slate-200"
                    >
                        Đổi cấp độ
                    </button>
                    <button 
                        onClick={() => setAppState('upload')}
                        className="w-full text-xs text-red-500 hover:bg-red-50 py-2 rounded"
                    >
                        Tải bài mới
                    </button>
                  </div>
               </div>
            </div>

          </div>
        )}
      </main>

      {/* FLASHCARD MODAL */}
      {showFlashcards && (
        <FlashcardReview 
            cards={getDueFlashcards()} 
            onClose={() => setShowFlashcards(false)}
            onUpdate={updateDueCount}
        />
      )}

    </div>
  );
};

export default App;
