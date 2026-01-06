
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
    <div className="max-w-7xl mx-auto w-full px-4 md:px-6">
      <div className="bg-white rounded-[40px] shadow-2xl shadow-indigo-100/50 border border-slate-200 min-h-[600px] flex flex-col relative animate-in fade-in duration-500 overflow-hidden">
        {/* Header Section */}
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-md relative z-10">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-xl">
                  {isManualMode ? '✍️' : '📖'}
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">{isManualMode ? 'Luyện dịch thủ công' : 'Đọc hiểu & Trắc nghiệm'}</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Bôi đen văn bản để tra từ vựng tức thì</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className={`text-[10px] font-black px-3 py-1 rounded-full border hidden sm:flex items-center gap-1 uppercase tracking-tighter ${isManualMode ? 'bg-slate-100 text-slate-600 border-slate-200' : (lessonData.source === 'Fallback' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200')}`}>
                    {isManualMode ? 'Manual' : (lessonData.source === 'Fallback' ? 'Fallback' : 'Gemini AI')}
                </div>
                <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
                <div className="relative">
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-2.5 rounded-xl hover:bg-slate-200 transition-all ${showSettings ? 'bg-slate-200 text-slate-900' : 'text-slate-500'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                    </button>
                    {showSettings && (
                        <div className="absolute top-full right-0 mt-3 w-72 bg-white rounded-[24px] shadow-2xl border border-slate-200 p-5 z-50 animate-in fade-in zoom-in duration-200">
                            <h4 className="font-black text-xs uppercase text-slate-400 mb-4 tracking-widest">Cài đặt giao diện</h4>
                            <div className="flex bg-slate-100 p-1 rounded-xl mb-5">
                                <button onClick={() => updateSetting('fontFamily', 'font-sans')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.fontFamily === 'font-sans' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Sans-Serif</button>
                                <button onClick={() => updateSetting('fontFamily', 'font-serif')} className={`flex-1 py-2 rounded-lg text-xs font-serif font-bold transition-all ${settings.fontFamily === 'font-serif' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Serif</button>
                            </div>
                            <div className="mb-5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase mb-3 block tracking-widest">Cỡ chữ</span>
                                <input type="range" min="0" max="4" step="1" value={['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'].indexOf(settings.fontSize)} onChange={(e) => updateSetting('fontSize', ['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'][parseInt(e.target.value)])} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                                <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-bold"><span>A</span><span>A+</span></div>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase mb-3 block tracking-widest">Màu nền</span>
                                <div className="flex gap-3">
                                    <button onClick={() => updateSetting('theme', 'light')} className={`flex-1 h-12 rounded-xl border-2 transition-all ${settings.theme === 'light' ? 'border-indigo-500 ring-2 ring-indigo-100 bg-white' : 'border-slate-100 bg-white'}`}></button>
                                    <button onClick={() => updateSetting('theme', 'sepia')} className={`flex-1 h-12 rounded-xl border-2 transition-all ${settings.theme === 'sepia' ? 'border-indigo-500 ring-2 ring-indigo-100 bg-[#fdfbf7]' : 'border-stone-100 bg-[#fdfbf7]'}`}></button>
                                    <button onClick={() => updateSetting('theme', 'dark')} className={`flex-1 h-12 rounded-xl border-2 transition-all ${settings.theme === 'dark' ? 'border-indigo-500 ring-2 ring-indigo-100 bg-slate-900' : 'border-slate-800 bg-slate-900'}`}></button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Content Section - Responsive Grid */}
        <div className={`flex-1 grid grid-cols-1 ${isManualMode ? 'lg:grid-cols-2 lg:divide-x divide-slate-100' : 'max-w-4xl mx-auto w-full'} p-0`}>
            
            {/* LEFT: SOURCE TEXT */}
            <div className={`p-8 md:p-12 overflow-y-auto custom-scrollbar ${isManualMode ? 'lg:sticky lg:top-0 lg:max-h-screen' : ''}`}>
                <div className="relative group" ref={textCardRef}>
                    <div className={`px-10 py-12 rounded-[32px] relative overflow-hidden transition-all duration-300 ${getThemeClasses()} border-2`} onMouseUp={handleTextMouseUp} translate="no">
                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-indigo-500/40"></div>
                        <div className={`absolute top-4 right-8 text-[10px] font-black uppercase tracking-widest ${settings.theme === 'dark' ? 'text-slate-600' : 'text-slate-300'}`}>SOURCE TEXT</div>
                        
                        {/* THE BEAUTIFIED TEXT BLOCK */}
                        <p className={`${settings.fontFamily} ${settings.fontSize} leading-[1.85] text-justify hyphens-auto break-words ${language === 'zh' ? 'tracking-widest' : 'tracking-normal'}`}>
                          {lessonData.cleanedSourceText}
                        </p>
                    </div>

                    {/* AI Lookup Tooltip */}
                    {selection.show && (
                        <div className={`absolute z-50 transform -translate-x-1/2 ${selection.placement === 'top' ? '-translate-y-full' : ''}`} style={{ top: selection.top, left: selection.left }}>
                             <div className="relative flex flex-col items-center">
                                {selection.placement === 'bottom' && <div className={`w-3 h-3 rotate-45 transform translate-y-1.5 ${getSelectionColor()}`}></div>}
                                <div className={`${getSelectionColor()} text-white rounded-2xl shadow-2xl w-max max-w-[320px] px-5 py-4 text-center ring-4 ring-white/10`}>
                                    {selection.loading ? 
                                      <div className="flex items-center gap-2 text-xs font-bold animate-pulse"><div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> Đang tra từ...</div> 
                                      : <div className="text-sm font-bold whitespace-normal leading-relaxed">{selection.result}</div>
                                    }
                                </div>
                                {selection.placement === 'top' && <div className={`w-3 h-3 rotate-45 transform -translate-y-1.5 ${getSelectionColor()}`}></div>}
                             </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: EDITOR / INTERACTIVE AREA */}
            <div className={`p-8 md:p-12 space-y-8 ${isManualMode ? 'bg-white' : ''}`}>
                <div className="relative">
                    <div className="absolute -top-3 left-6 bg-white px-2 z-10">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Bản dịch tiếng Việt của bạn</span>
                    </div>
                    <textarea 
                        ref={inputRef} 
                        value={userTranslation} 
                        onChange={(e) => setUserTranslation(e.target.value)} 
                        placeholder="Bắt đầu gõ bản dịch tại đây..." 
                        className={`w-full p-8 rounded-[32px] border-2 border-slate-100 bg-slate-50/30 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-lg leading-relaxed ${isManualMode ? 'min-h-[450px]' : 'min-h-[250px]'}`} 
                    />
                </div>

                {!showResult && !isManualMode ? (
                    <button 
                      onClick={handleCheck} 
                      disabled={userTranslation.length < 2} 
                      className="w-full bg-slate-900 text-white text-lg font-black py-5 rounded-[24px] shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                    >
                        ✨ KIỂM TRA & LÀM TRẮC NGHIỆM
                    </button>
                ) : isManualMode ? (
                    <button 
                      onClick={handleFinishChunk} 
                      className="w-full bg-indigo-600 text-white text-lg font-black py-5 rounded-[24px] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                    >
                        HOÀN THÀNH BÀI DỊCH
                    </button>
                ) : (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {translationScore !== null && (
                            <div className={`p-8 rounded-[32px] border-2 flex items-center justify-between ${translationScore >= 80 ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                                <div>
                                  <h4 className="font-black text-xl mb-1 uppercase tracking-tighter">Độ chính xác: {translationScore}%</h4>
                                  <p className="text-xs font-bold opacity-70">So sánh ngữ nghĩa với bản dịch AI</p>
                                </div>
                                <div className="text-4xl">{translationScore >= 80 ? '🎯' : '💪'}</div>
                            </div>
                        )}
                        {lessonData.referenceTranslation && (
                            <div className="bg-indigo-50/50 border-2 border-indigo-100 rounded-[32px] p-8 relative">
                                <div className="absolute -top-3 left-6 bg-white px-3 py-1 rounded-full border border-indigo-100"><span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Bản dịch tham khảo (AI)</span></div>
                                <p className="text-indigo-950 text-lg leading-relaxed italic">"{lessonData.referenceTranslation}"</p>
                            </div>
                        )}
                        
                        {/* Quiz Section */}
                        {lessonData.quiz && lessonData.quiz.length > 0 && (
                            <div className="bg-slate-900 rounded-[40px] p-8 md:p-10 shadow-2xl">
                                <h3 className="text-xl font-black text-white mb-8 flex items-center gap-3">
                                  <span className="bg-white/10 w-8 h-8 rounded-lg flex items-center justify-center text-sm">❓</span>
                                  TRẮC NGHIỆM ĐỌC HIỂU
                                </h3>
                                <div className="space-y-10">
                                    {lessonData.quiz.map((q, qIdx) => (
                                        <div key={qIdx} className="space-y-5">
                                            <p className="font-bold text-slate-200 text-lg">{qIdx+1}. {q.question}</p>
                                            <div className="grid grid-cols-1 gap-3">
                                                {q.options.map((opt, optIdx) => (
                                                    <button 
                                                      key={optIdx} 
                                                      onClick={() => !quizSubmitted && setQuizAnswers(prev => {const n=[...prev]; n[qIdx]=optIdx; return n;})} 
                                                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all font-bold ${quizSubmitted ? (q.correctAnswer === optIdx ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : (quizAnswers[qIdx] === optIdx ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-white/5 border-white/5 text-slate-500')) : (quizAnswers[qIdx] === optIdx ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10')}`} 
                                                      disabled={quizSubmitted}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                            {quizSubmitted && q.explanation && (
                                              <div className="text-xs text-slate-500 italic px-2">Giải thích: {q.explanation}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {!quizSubmitted && (
                                    <button 
                                      onClick={() => setQuizSubmitted(true)} 
                                      disabled={quizAnswers.length < lessonData.quiz.length} 
                                      className="mt-10 w-full py-4 bg-white text-slate-900 font-black rounded-2xl hover:bg-indigo-50 disabled:opacity-30 transition-all"
                                    >
                                      NỘP BÀI TRẮC NGHIỆM
                                    </button>
                                )}
                            </div>
                        )}
                        <button onClick={handleFinishChunk} disabled={!quizSubmitted && lessonData.quiz?.length > 0} className="w-full bg-indigo-600 text-white py-5 rounded-[24px] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">TIẾP TỤC BÀI HỌC →</button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
