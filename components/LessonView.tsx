
import React, { useState, useEffect, useRef } from 'react';
import { ProcessedChunk, QuizQuestion, LessonContent } from '../types';
import { generateLessonForChunk, explainPhrase } from '../services/geminiService';

interface LessonViewProps {
  chunk: ProcessedChunk;
  totalChunks: number;
  language: 'en' | 'zh'; 
  onComplete: (chunkId: number) => void;
  onNext: () => void;
  onLookup: (term: string, meaning: string, explanation: string, phonetic: string) => void;
  onContentUpdate: (chunkId: number, content: LessonContent) => void; 
  isLast: boolean;
}

interface SelectionState {
    text: string; 
    top: number; 
    left: number; 
    show: boolean; 
    loading: boolean; 
    result?: string;
    placement: 'top' | 'bottom';
}

type ThemeMode = 'light' | 'sepia' | 'dark';
type FontFamily = 'font-serif' | 'font-sans';
type FontSize = 'text-base' | 'text-lg' | 'text-xl' | 'text-2xl' | 'text-3xl';

interface ReadingSettings {
    theme: ThemeMode;
    fontFamily: FontFamily;
    fontSize: FontSize;
}

const calculateSimilarity = (s1: string, s2: string): number => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 100;
    const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    return Math.round(((longerLength - editDistance) / longerLength) * 100);
};

const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
};

export const LessonView: React.FC<LessonViewProps> = ({ chunk, language, totalChunks, onComplete, onNext, onLookup, onContentUpdate, isLast }) => {
  const [loading, setLoading] = useState(false);
  const [lessonData, setLessonData] = useState(chunk.content);
  const [userTranslation, setUserTranslation] = useState('');
  const [translationScore, setTranslationScore] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]); 
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [selection, setSelection] = useState<SelectionState>({ 
      text: '', top: 0, left: 0, show: false, loading: false, placement: 'top' 
  });
  const textCardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ReadingSettings>({
      theme: 'sepia',
      fontFamily: 'font-serif',
      fontSize: 'text-xl' 
  });

  useEffect(() => {
      const saved = localStorage.getItem('paperlingo_reading_settings');
      if (saved) try { setSettings(JSON.parse(saved)); } catch(e) {}
  }, []);

  const updateSetting = (key: keyof ReadingSettings, value: any) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      localStorage.setItem('paperlingo_reading_settings', JSON.stringify(newSettings));
  };

  useEffect(() => {
    setUserTranslation('');
    setTranslationScore(null);
    setShowResult(false);
    setQuizAnswers([]); 
    setQuizSubmitted(false);
    setSelection({ text: '', top: 0, left: 0, show: false, loading: false, placement: 'top' });
    setShowSettings(false);
    
    if (chunk.content) {
      setLessonData(chunk.content);
      setLoading(false);
    } else {
      fetchAIContent();
    }
  }, [chunk.id]);

  const fetchAIContent = async () => {
    setLoading(true);
    try {
      const data = await generateLessonForChunk(chunk.text, language);
      setLessonData(data);
      onContentUpdate(chunk.id, data); 
    } catch (e: any) {
      setLessonData({ cleanedSourceText: chunk.text, referenceTranslation: "", quiz: [], source: 'Fallback' });
    } finally {
      setLoading(false);
    }
  };

  const handleTextMouseUp = () => {
      const winSelection = window.getSelection();
      if (!winSelection || winSelection.isCollapsed) {
          if (selection.show && !selection.loading) setSelection(prev => ({ ...prev, show: false }));
          return;
      }
      const text = winSelection.toString().trim();
      if (text.length > 0 && text.split(/\s+/).length <= 12) {
          const range = winSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = textCardRef.current?.getBoundingClientRect();
          if (containerRect) {
            const placement = rect.top < 160 ? 'bottom' : 'top';
            let top = placement === 'top' ? rect.top - containerRect.top - 12 : rect.bottom - containerRect.top + 12;
            setSelection({ text, top, left: rect.left - containerRect.left + (rect.width / 2), show: true, loading: true, placement });
            performLookup(text);
          }
      }
  };

  const performLookup = async (text: string) => {
      try {
          const context = lessonData?.cleanedSourceText || chunk.text;
          const result = await explainPhrase(text, context);
          onLookup(text, result.shortMeaning, result.detailedExplanation, result.phonetic);
          setSelection(prev => (prev.text === text && prev.show) ? { ...prev, loading: false, result: result.shortMeaning } : prev);
      } catch (e) {
          setSelection(prev => ({ ...prev, loading: false, show: false }));
      }
  };

  const handleCheck = () => {
      if (!lessonData) return;
      if (lessonData.source === 'Manual') {
          handleFinishChunk();
          return;
      }
      const score = calculateSimilarity(userTranslation, lessonData.referenceTranslation || "");
      setTranslationScore(score);
      setShowResult(true);
  };

  const handleFinishChunk = () => {
      onComplete(chunk.id);
      if (!isLast) onNext();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getThemeClasses = () => {
      switch (settings.theme) {
          case 'dark': return 'bg-slate-900 border-slate-700 text-slate-300 shadow-xl';
          case 'light': return 'bg-white border-slate-200 text-slate-900 shadow-inner';
          default: return 'bg-[#fdfbf7] border-stone-200 text-slate-800 shadow-inner';
      }
  };
  
  const getSelectionColor = () => settings.theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-900'; 

  if (loading) return (
      <div className="h-96 flex flex-col items-center justify-center bg-white rounded-2xl border gap-4">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
          <p className="text-slate-500 text-sm animate-pulse">Đang chuẩn bị nội dung...</p>
      </div>
  );

  if (!lessonData || lessonData.cleanedSourceText.length === 0) return null;

  const isManualMode = lessonData.source === 'Manual';

  return (
    <div className="max-w-7xl mx-auto w-full px-4 md:px-6 mb-12">
      <div className="bg-white rounded-[48px] shadow-2xl shadow-indigo-100/50 border border-slate-200 flex flex-col relative animate-in fade-in duration-500 overflow-hidden">
        
        {/* HEADER SECTION */}
        <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 backdrop-blur-md z-10">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-2xl border border-slate-100">
                  {isManualMode ? '✍️' : '📖'}
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-[0.15em]">{isManualMode ? 'Luyện dịch thủ công' : 'Đọc hiểu & Trắc nghiệm'}</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Bôi đen văn bản để tra từ vựng tức thì</p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className={`text-[10px] font-black px-4 py-1.5 rounded-full border hidden sm:flex items-center gap-2 uppercase tracking-tighter ${isManualMode ? 'bg-slate-100 text-slate-600 border-slate-200' : (lessonData.source === 'Fallback' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200')}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                    {isManualMode ? 'Manual' : (lessonData.source === 'Fallback' ? 'Fallback' : 'Gemini AI')}
                </div>
                <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
                <div className="relative">
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-3 rounded-2xl hover:bg-slate-200 transition-all ${showSettings ? 'bg-slate-200 text-slate-900' : 'text-slate-500'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                    </button>
                    {showSettings && (
                        <div className="absolute top-full right-0 mt-4 w-80 bg-white rounded-[32px] shadow-2xl border border-slate-200 p-6 z-50 animate-in fade-in zoom-in duration-200">
                            <h4 className="font-black text-[10px] uppercase text-slate-400 mb-5 tracking-[0.2em]">Cấu hình đọc</h4>
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
                                <button onClick={() => updateSetting('fontFamily', 'font-sans')} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${settings.fontFamily === 'font-sans' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Sans-Serif</button>
                                <button onClick={() => updateSetting('fontFamily', 'font-serif')} className={`flex-1 py-2.5 rounded-xl text-xs font-serif font-bold transition-all ${settings.fontFamily === 'font-serif' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Serif</button>
                            </div>
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-4">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cỡ chữ</span>
                                  <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase">Mức {['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'].indexOf(settings.fontSize)}</span>
                                </div>
                                <input type="range" min="0" max="4" step="1" value={['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'].indexOf(settings.fontSize)} onChange={(e) => updateSetting('fontSize', ['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'][parseInt(e.target.value)])} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase mb-4 block tracking-widest">Giao diện màu</span>
                                <div className="flex gap-4">
                                    <button onClick={() => updateSetting('theme', 'light')} className={`flex-1 h-14 rounded-2xl border-4 transition-all ${settings.theme === 'light' ? 'border-indigo-500 bg-white' : 'border-slate-100 bg-white'}`}></button>
                                    <button onClick={() => updateSetting('theme', 'sepia')} className={`flex-1 h-14 rounded-2xl border-4 transition-all ${settings.theme === 'sepia' ? 'border-indigo-500 bg-[#fdfbf7]' : 'border-stone-100 bg-[#fdfbf7]'}`}></button>
                                    <button onClick={() => updateSetting('theme', 'dark')} className={`flex-1 h-14 rounded-2xl border-4 transition-all ${settings.theme === 'dark' ? 'border-indigo-500 bg-slate-900' : 'border-slate-800 bg-slate-900'}`}></button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* MAIN WORKING AREA */}
        <div className={`flex-1 grid grid-cols-1 ${isManualMode ? 'lg:grid-cols-2 lg:divide-x divide-slate-100' : 'max-w-4xl mx-auto w-full'} p-0`}>
            
            {/* LEFT: SOURCE TEXT */}
            <div className={`p-8 md:p-12 overflow-y-auto custom-scrollbar ${isManualMode ? 'lg:sticky lg:top-0 lg:max-h-[calc(100vh-200px)]' : ''}`}>
                <div className="relative group" ref={textCardRef}>
                    <div className={`px-12 py-14 rounded-[40px] relative overflow-hidden transition-all duration-300 ${getThemeClasses()} border-2 min-h-[400px]`} onMouseUp={handleTextMouseUp} translate="no">
                        <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-indigo-500/30"></div>
                        <div className={`absolute top-6 right-10 text-[10px] font-black uppercase tracking-[0.3em] ${settings.theme === 'dark' ? 'text-slate-600' : 'text-slate-300'}`}>DOCUMENT</div>
                        
                        <p className={`${settings.fontFamily} ${settings.fontSize} leading-[2.1] text-justify hyphens-auto break-words ${language === 'zh' ? 'tracking-widest' : 'tracking-normal'}`}>
                          {lessonData.cleanedSourceText}
                        </p>
                    </div>

                    {/* AI Lookup Tooltip */}
                    {selection.show && (
                        <div className={`absolute z-50 transform -translate-x-1/2 ${selection.placement === 'top' ? '-translate-y-full' : ''}`} style={{ top: selection.top, left: selection.left }}>
                             <div className="relative flex flex-col items-center">
                                {selection.placement === 'bottom' && <div className={`w-3 h-3 rotate-45 transform translate-y-1.5 ${getSelectionColor()}`}></div>}
                                <div className={`${getSelectionColor()} text-white rounded-[20px] shadow-2xl w-max max-w-[340px] px-6 py-5 text-center ring-8 ring-white/5 border border-white/10`}>
                                    {selection.loading ? 
                                      <div className="flex items-center gap-3 text-xs font-black animate-pulse"><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> AI ĐANG TRA TỪ...</div> 
                                      : <div className="text-sm font-bold whitespace-normal leading-relaxed">{selection.result}</div>
                                    }
                                </div>
                                {selection.placement === 'top' && <div className={`w-3 h-3 rotate-45 transform -translate-y-1.5 ${getSelectionColor()}`}></div>}
                             </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: EDITOR AREA */}
            <div className={`p-8 md:p-12 flex flex-col ${isManualMode ? 'bg-white' : ''}`}>
                <div className="relative flex-1">
                    <div className="absolute -top-3 left-8 bg-white px-3 py-0.5 rounded-full border border-slate-100 z-10">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Khu vực soạn thảo bản dịch</span>
                    </div>
                    <textarea 
                        ref={inputRef} 
                        value={userTranslation} 
                        onChange={(e) => setUserTranslation(e.target.value)} 
                        placeholder="Bản dịch của bạn sẽ xuất hiện tại đây..." 
                        className={`w-full p-10 rounded-[40px] border-2 border-slate-100 bg-slate-50/20 focus:bg-white focus:border-indigo-500 focus:ring-8 focus:ring-indigo-500/5 transition-all text-xl leading-[1.8] placeholder:text-slate-300 ${isManualMode ? 'min-h-[500px]' : 'min-h-[300px]'}`} 
                    />
                </div>

                {/* AI Results (Only for AI Mode) */}
                {!isManualMode && showResult && (
                    <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {translationScore !== null && (
                            <div className={`p-8 rounded-[32px] border-2 flex items-center justify-between ${translationScore >= 80 ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                                <div>
                                  <h4 className="font-black text-xl mb-1 uppercase tracking-tighter">Độ chính xác: {translationScore}%</h4>
                                  <p className="text-xs font-bold opacity-70">Dựa trên phân tích ngữ nghĩa AI</p>
                                </div>
                                <div className="text-4xl">{translationScore >= 80 ? '🎯' : '💪'}</div>
                            </div>
                        )}
                        {lessonData.referenceTranslation && (
                            <div className="bg-indigo-50/50 border-2 border-indigo-100 rounded-[32px] p-8 relative">
                                <div className="absolute -top-3 left-8 bg-white px-4 py-1 rounded-full border border-indigo-100"><span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">BẢN DỊCH THAM KHẢO</span></div>
                                <p className="text-indigo-950 text-xl leading-relaxed italic">"{lessonData.referenceTranslation}"</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* FOOTER ACTION AREA - Dedicated section for finishing */}
        <div className="px-10 py-10 bg-slate-50/80 border-t border-slate-100 flex flex-col items-center justify-center gap-6">
            {!showResult && !isManualMode ? (
                <button 
                  onClick={handleCheck} 
                  disabled={userTranslation.length < 5} 
                  className="w-full max-w-2xl bg-slate-900 text-white text-lg font-black py-6 rounded-[28px] shadow-2xl shadow-slate-200 hover:bg-slate-800 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none group"
                >
                    <span className="flex items-center justify-center gap-3">
                        ✨ KIỂM TRA & LÀM TRẮC NGHIỆM
                        <span className="text-xs font-normal opacity-50 px-2 py-0.5 border border-white/20 rounded-lg group-hover:bg-white/10">Shift + Enter</span>
                    </span>
                </button>
            ) : isManualMode ? (
                <div className="w-full max-w-2xl text-center space-y-6">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Bạn đã hoàn thành việc luyện dịch chưa?</p>
                    <button 
                      onClick={handleFinishChunk} 
                      className="w-full bg-indigo-600 text-white text-xl font-black py-7 rounded-[32px] shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-4"
                    >
                        HOÀN THÀNH BÀI DỊCH
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </button>
                </div>
            ) : (
                /* Post-check AI Mode (Quiz & Final Button) */
                <div className="w-full space-y-12">
                     {/* Quiz Section inside footer for better focus after translation */}
                     {lessonData.quiz && lessonData.quiz.length > 0 && (
                        <div className="max-w-4xl mx-auto bg-slate-900 rounded-[48px] p-10 md:p-14 shadow-2xl overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-8 text-white/5 text-8xl font-black select-none pointer-events-none">QUIZ</div>
                            <h3 className="text-2xl font-black text-white mb-10 flex items-center gap-4">
                              <span className="bg-indigo-500 w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20">❓</span>
                              KIỂM TRA ĐỘ HIỂU
                            </h3>
                            <div className="space-y-12">
                                {lessonData.quiz.map((q, qIdx) => (
                                    <div key={qIdx} className="space-y-6">
                                        <p className="font-bold text-slate-100 text-xl leading-relaxed">{qIdx+1}. {q.question}</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {q.options.map((opt, optIdx) => (
                                                <button 
                                                  key={optIdx} 
                                                  onClick={() => !quizSubmitted && setQuizAnswers(prev => {const n=[...prev]; n[qIdx]=optIdx; return n;})} 
                                                  className={`w-full text-left p-6 rounded-3xl border-2 transition-all font-bold text-sm leading-relaxed ${quizSubmitted ? (q.correctAnswer === optIdx ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : (quizAnswers[qIdx] === optIdx ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-white/5 border-white/5 text-slate-600')) : (quizAnswers[qIdx] === optIdx ? 'bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10')}`} 
                                                  disabled={quizSubmitted}
                                                >
                                                    <span className="inline-block w-8 h-8 rounded-full bg-black/20 mr-3 text-center leading-8 uppercase text-xs">{String.fromCharCode(65 + optIdx)}</span>
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                        {quizSubmitted && q.explanation && (
                                          <div className="text-sm text-indigo-300 italic px-6 py-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">💡 <strong>Giải thích:</strong> {q.explanation}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {!quizSubmitted ? (
                                <button 
                                  onClick={() => setQuizSubmitted(true)} 
                                  disabled={quizAnswers.length < lessonData.quiz.length} 
                                  className="mt-14 w-full py-6 bg-white text-slate-900 font-black rounded-3xl hover:bg-indigo-50 disabled:opacity-20 transition-all text-lg"
                                >
                                  NỘP BÀI TRẮC NGHIỆM
                                </button>
                            ) : (
                                <button 
                                  onClick={handleFinishChunk} 
                                  className="mt-14 w-full py-6 bg-indigo-500 text-white font-black rounded-3xl hover:bg-indigo-600 transition-all text-lg flex items-center justify-center gap-3"
                                >
                                  TIẾP TỤC HÀNH TRÌNH →
                                </button>
                            )}
                        </div>
                    )}
                    
                    {(!lessonData.quiz || lessonData.quiz.length === 0) && (
                        <button onClick={handleFinishChunk} className="w-full max-w-2xl bg-indigo-600 text-white py-7 rounded-[32px] font-black text-xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all mx-auto block">XÁC NHẬN HOÀN TẤT →</button>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
