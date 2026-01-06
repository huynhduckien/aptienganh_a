
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
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col relative animate-in fade-in duration-500">
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-3xl relative">
             <div className="flex items-center gap-2">
                <span className="text-2xl">{isManualMode ? '✍️' : '📖'}</span>
                <h2 className="text-lg font-bold text-slate-800">{isManualMode ? 'Manual Translation' : 'Reading & Quiz'}</h2>
            </div>
            <div className="flex items-center gap-3">
                <div className={`text-xs font-bold px-3 py-1 rounded-full border hidden sm:flex items-center gap-1 ${isManualMode ? 'bg-slate-100 text-slate-600 border-slate-200' : (lessonData.source === 'Fallback' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200')}`}>
                    {isManualMode ? 'Dịch thủ công' : (lessonData.source === 'Fallback' ? 'Chế độ dự phòng' : 'AI Gemini Mode')}
                </div>
                <div className="relative">
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-lg hover:bg-slate-200 transition-colors ${showSettings ? 'bg-slate-200 text-slate-900' : 'text-slate-500'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                    </button>
                    {showSettings && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in duration-200">
                            <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                                <button onClick={() => updateSetting('fontFamily', 'font-sans')} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${settings.fontFamily === 'font-sans' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Sans</button>
                                <button onClick={() => updateSetting('fontFamily', 'font-serif')} className={`flex-1 py-1.5 rounded-md text-xs font-serif font-bold transition-all ${settings.fontFamily === 'font-serif' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Serif</button>
                            </div>
                            <div className="mb-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">Cỡ chữ</span>
                                <input type="range" min="0" max="4" step="1" value={['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'].indexOf(settings.fontSize)} onChange={(e) => updateSetting('fontSize', ['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'][parseInt(e.target.value)])} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">Chế độ nền</span>
                                <div className="flex gap-2">
                                    <button onClick={() => updateSetting('theme', 'light')} className={`flex-1 h-10 rounded-lg border bg-white ${settings.theme === 'light' ? 'ring-2 ring-indigo-500' : 'border-slate-200'}`}></button>
                                    <button onClick={() => updateSetting('theme', 'sepia')} className={`flex-1 h-10 rounded-lg border bg-[#fdfbf7] ${settings.theme === 'sepia' ? 'ring-2 ring-indigo-500' : 'border-stone-200'}`}></button>
                                    <button onClick={() => updateSetting('theme', 'dark')} className={`flex-1 h-10 rounded-lg border bg-slate-900 ${settings.theme === 'dark' ? 'ring-2 ring-indigo-500' : 'border-slate-800'}`}></button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="w-full p-6 md:p-8 space-y-8">
            <div className="relative group" ref={textCardRef}>
                <div className={`px-8 py-8 rounded-2xl relative overflow-hidden transition-all duration-300 ${getThemeClasses()}`} onMouseUp={handleTextMouseUp} translate="no">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 opacity-80"></div>
                    <div className={`absolute top-2 right-2 text-xs font-bold uppercase ${settings.theme === 'dark' ? 'text-slate-600' : 'text-slate-300'}`}>Source Text</div>
                    <p className={`${settings.fontFamily} ${settings.fontSize} leading-loose ${language === 'zh' ? 'tracking-widest' : 'tracking-normal'}`}>{lessonData.cleanedSourceText}</p>
                </div>
                {selection.show && (
                    <div className={`absolute z-50 transform -translate-x-1/2 ${selection.placement === 'top' ? '-translate-y-full' : ''}`} style={{ top: selection.top, left: selection.left }}>
                         <div className="relative flex flex-col items-center">
                            {selection.placement === 'bottom' && <div className={`w-3 h-3 rotate-45 transform translate-y-1.5 ${getSelectionColor()}`}></div>}
                            <div className={`${getSelectionColor()} text-white rounded-xl shadow-xl w-max max-w-[320px] px-4 py-3 text-center`}>
                                {selection.loading ? <div className="text-sm font-bold animate-pulse">Đang tra từ...</div> : <div className="text-sm font-bold whitespace-normal leading-relaxed">{selection.result}</div>}
                            </div>
                            {selection.placement === 'top' && <div className={`w-3 h-3 rotate-45 transform -translate-y-1.5 ${getSelectionColor()}`}></div>}
                         </div>
                    </div>
                )}
            </div>

            <div className="relative">
                <div className="absolute -top-3 left-4 bg-white px-2 z-10"><span className="text-xs font-bold text-slate-400 uppercase">Bản dịch của bạn</span></div>
                <textarea ref={inputRef} value={userTranslation} onChange={(e) => setUserTranslation(e.target.value)} placeholder="Gõ bản dịch..." className="w-full p-6 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 min-h-[200px] text-lg" />
            </div>

            {!showResult && !isManualMode ? (
                <button onClick={handleCheck} disabled={userTranslation.length < 2} className="w-full bg-slate-900 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800">✨ Kiểm tra & Làm trắc nghiệm</button>
            ) : isManualMode ? (
                <button onClick={handleFinishChunk} className="w-full bg-slate-900 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800">Hoàn thành bài dịch</button>
            ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {translationScore !== null && (
                        <div className={`p-6 rounded-xl border flex items-center justify-between ${translationScore >= 80 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                            <div><h4 className="font-bold text-lg mb-1">Kết quả dịch</h4><p className="text-sm">Độ chính xác so với máy: {translationScore}%</p></div>
                        </div>
                    )}
                    {lessonData.referenceTranslation && (
                        <div className="bg-green-50 border border-green-100 rounded-xl p-6">
                            <h4 className="text-xs font-bold text-green-700 uppercase mb-3">Đáp án tham khảo</h4>
                            <p className="text-green-900 text-lg leading-relaxed">{lessonData.referenceTranslation}</p>
                        </div>
                    )}
                    {lessonData.quiz && lessonData.quiz.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
                            <h3 className="text-lg font-bold text-indigo-900 mb-4">Trắc nghiệm Đọc hiểu</h3>
                            <div className="space-y-6">
                                {lessonData.quiz.map((q, qIdx) => (
                                    <div key={qIdx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <p className="font-bold text-slate-800 mb-4">{qIdx+1}. {q.question}</p>
                                        <div className="space-y-2">
                                            {q.options.map((opt, optIdx) => (
                                                <button key={optIdx} onClick={() => !quizSubmitted && setQuizAnswers(prev => {const n=[...prev]; n[qIdx]=optIdx; return n;})} className={`w-full text-left p-3 rounded-lg border ${quizSubmitted ? (q.correctAnswer === optIdx ? 'bg-green-100 border-green-500' : (quizAnswers[qIdx] === optIdx ? 'bg-red-50 border-red-300' : '')) : (quizAnswers[qIdx] === optIdx ? 'bg-indigo-100 border-indigo-500' : 'hover:bg-slate-50')}`} disabled={quizSubmitted}>
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {!quizSubmitted && (
                                <button onClick={() => setQuizSubmitted(true)} disabled={quizAnswers.length < lessonData.quiz.length} className="mt-4 px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Nộp bài</button>
                            )}
                        </div>
                    )}
                    <button onClick={handleFinishChunk} disabled={!quizSubmitted && lessonData.quiz?.length > 0} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg">Tiếp tục →</button>
                </div>
            )}
        </div>
    </div>
  );
};
