
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
    placement: 'top' | 'bottom'; // NEW: Track placement direction
}

// --- APPEARANCE SETTINGS TYPES ---
type ThemeMode = 'light' | 'sepia' | 'dark';
type FontFamily = 'font-serif' | 'font-sans';
type FontSize = 'text-base' | 'text-lg' | 'text-xl' | 'text-2xl' | 'text-3xl';

interface ReadingSettings {
    theme: ThemeMode;
    fontFamily: FontFamily;
    fontSize: FontSize;
}

// --- HELPER: Levenshtein Distance for Similarity Score ---
const calculateSimilarity = (s1: string, s2: string): number => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;

    if (longerLength === 0) return 100;

    const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    const similarity = (longerLength - editDistance) / longerLength;
    
    return Math.round(similarity * 100);
};

const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
};

const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-100 border-emerald-200';
    if (score >= 50) return 'text-amber-600 bg-amber-100 border-amber-200';
    return 'text-red-600 bg-red-100 border-red-200';
};

const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Tuyệt vời! 🏆';
    if (score >= 80) return 'Rất tốt! 🌟';
    if (score >= 60) return 'Khá tốt 👍';
    if (score >= 40) return 'Tạm ổn 👌';
    return 'Cần cố gắng thêm 💪';
};

export const LessonView: React.FC<LessonViewProps> = ({ chunk, language, totalChunks, onComplete, onNext, onLookup, onContentUpdate, isLast }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonData, setLessonData] = useState(chunk.content);
  
  // Translation State
  const [userTranslation, setUserTranslation] = useState('');
  const [translationScore, setTranslationScore] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Quiz State
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]); 
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Selection State
  const [selection, setSelection] = useState<SelectionState>({ 
      text: '', top: 0, left: 0, show: false, loading: false, placement: 'top' 
  });
  
  // REF changed to point to the Card Wrapper for better positioning
  const textCardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- APPEARANCE STATE ---
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ReadingSettings>({
      theme: 'sepia',
      fontFamily: 'font-serif',
      fontSize: 'text-xl' 
  });

  useEffect(() => {
      const saved = localStorage.getItem('paperlingo_reading_settings');
      if (saved) {
          try { setSettings(JSON.parse(saved)); } catch(e) {}
      }
  }, []);

  const updateSetting = (key: keyof ReadingSettings, value: any) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      localStorage.setItem('paperlingo_reading_settings', JSON.stringify(newSettings));
  };

  // --- END APPEARANCE STATE ---

  useEffect(() => {
    setUserTranslation('');
    setTranslationScore(null);
    setShowResult(false);
    setQuizAnswers([]); 
    setQuizSubmitted(false);
    setError(null);
    setSelection({ text: '', top: 0, left: 0, show: false, loading: false, placement: 'top' });
    
    setShowSettings(false);
    
    setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 100);
    
    if (chunk.content) {
      setLessonData(chunk.content);
      setLoading(false);
      if (chunk.content.cleanedSourceText.trim().length === 0) {
          handleAutoSkip();
      }
    } else {
      fetchAIContent();
    }
  }, [chunk.id]);

  const handleAutoSkip = () => {
      setTimeout(() => {
          onComplete(chunk.id);
          if (!isLast) onNext();
      }, 500); 
  };

  const fetchAIContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateLessonForChunk(chunk.text, language);
      
      if (!data.cleanedSourceText || data.cleanedSourceText.trim().length === 0) {
          setLessonData(data); 
          onContentUpdate(chunk.id, data); 
          handleAutoSkip();
          return;
      }

      setLessonData(data);
      onContentUpdate(chunk.id, data); 
    } catch (e: any) {
      console.error(e);
      setError("Lỗi kết nối nghiêm trọng.");
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
      const wordCount = text.split(/\s+/).length;
      
      if (text.length > 0 && wordCount <= 12) {
          const range = winSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect(); // Viewport relative
          const containerRect = textCardRef.current?.getBoundingClientRect();

          if (containerRect) {
            // Logic to flip tooltip if too close to top
            // Header is ~80px. Add buffer.
            const HEADER_OFFSET = 160; 
            const placement = rect.top < HEADER_OFFSET ? 'bottom' : 'top';
            
            // Calculate relative position based on placement
            let top = 0;
            if (placement === 'top') {
                top = rect.top - containerRect.top - 12; // 12px gap above text
            } else {
                top = rect.bottom - containerRect.top + 12; // 12px gap below text
            }

            setSelection({
                text,
                top: top,
                left: rect.left - containerRect.left + (rect.width / 2),
                show: true, 
                loading: true, 
                result: undefined,
                placement
            });
            performLookup(text);
          }
      }
  };

  const performLookup = async (text: string) => {
      try {
          const context = lessonData?.cleanedSourceText || chunk.text;
          const result = await explainPhrase(text, context);
          onLookup(text, result.shortMeaning, result.detailedExplanation, result.phonetic);
          setSelection(prev => {
              if (prev.text === text && prev.show) return { ...prev, loading: false, result: result.shortMeaning };
              return prev;
          });
      } catch (e) {
          setSelection(prev => ({ ...prev, loading: false, show: false }));
      }
  };

  const handleQuizSelect = (qIndex: number, optionIndex: number) => {
      if (quizSubmitted) return;
      setQuizAnswers(prev => {
          const newAnswers = [...prev];
          newAnswers[qIndex] = optionIndex;
          return newAnswers;
      });
  };

  const handleCheck = () => {
      if (!lessonData) return;
      const reference = lessonData.referenceTranslation || "";
      const score = calculateSimilarity(userTranslation, reference);
      setTranslationScore(score);
      setShowResult(true);
  };

  const handleFinishChunk = () => {
      onComplete(chunk.id);
      if (!isLast) onNext();
  };

  const isFallbackMode = lessonData?.source === 'Fallback';

  // --- THEME CLASSES MAPPING ---
  const getThemeClasses = () => {
      switch (settings.theme) {
          case 'dark':
              return 'bg-slate-900 border-slate-700 text-slate-300 shadow-xl';
          case 'light':
              return 'bg-white border-slate-200 text-slate-900 shadow-inner';
          case 'sepia':
          default:
              return 'bg-[#fdfbf7] border-stone-200 text-slate-800 shadow-inner';
      }
  };
  
  const getSelectionColor = () => {
      return settings.theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-900'; 
  };

  if (loading) return (
      <div className="h-96 flex flex-col items-center justify-center bg-white rounded-2xl border gap-4">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
          <p className="text-slate-500 text-sm animate-pulse">AI đang đọc & làm sạch văn bản...</p>
      </div>
  );

  if (!lessonData || lessonData.cleanedSourceText.length === 0) return (
      <div className="h-96 flex flex-col items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <p className="text-slate-400">Đang bỏ qua phần nội dung rác (Metadata/Header)...</p>
      </div>
  );

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col relative animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-3xl relative">
             <div className="flex items-center gap-2">
                <span className="text-2xl">📖</span>
                <h2 className="text-lg font-bold text-slate-800">Reading & Quiz</h2>
            </div>
            
            <div className="flex items-center gap-3">
                <div className={`text-xs font-bold px-3 py-1 rounded-full border hidden sm:flex items-center gap-1 ${isFallbackMode ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                    {isFallbackMode ? 'Chế độ dự phòng' : 'AI Gemini Mode'}
                </div>
                
                {/* APPEARANCE BUTTON */}
                <div className="relative">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg hover:bg-slate-200 transition-colors ${showSettings ? 'bg-slate-200 text-slate-900' : 'text-slate-500'}`}
                        title="Tùy chỉnh giao diện đọc"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                    </button>

                    {/* SETTINGS DROPDOWN */}
                    {showSettings && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in duration-200">
                            {/* Font Family */}
                            <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                                <button 
                                    onClick={() => updateSetting('fontFamily', 'font-sans')}
                                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${settings.fontFamily === 'font-sans' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Sans
                                </button>
                                <button 
                                    onClick={() => updateSetting('fontFamily', 'font-serif')}
                                    className={`flex-1 py-1.5 rounded-md text-xs font-serif font-bold transition-all ${settings.fontFamily === 'font-serif' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Serif
                                </button>
                            </div>

                            {/* Font Size */}
                            <div className="mb-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Kích thước chữ</span>
                                <input 
                                    type="range" 
                                    min="0" max="4" 
                                    step="1"
                                    value={['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'].indexOf(settings.fontSize)}
                                    onChange={(e) => {
                                        const sizes: FontSize[] = ['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'];
                                        updateSetting('fontSize', sizes[parseInt(e.target.value)]);
                                    }}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                                <div className="flex justify-between text-xs text-slate-400 mt-1 font-bold">
                                    <span>A</span>
                                    <span>A+</span>
                                </div>
                            </div>

                            {/* Theme */}
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Chế độ nền</span>
                                <div className="flex gap-2">
                                    <button onClick={() => updateSetting('theme', 'light')} className={`flex-1 h-10 rounded-lg border flex items-center justify-center ${settings.theme === 'light' ? 'ring-2 ring-indigo-500 border-transparent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                        <div className="w-4 h-4 rounded-full border border-slate-300 bg-white"></div>
                                    </button>
                                    <button onClick={() => updateSetting('theme', 'sepia')} className={`flex-1 h-10 rounded-lg border flex items-center justify-center bg-[#fdfbf7] ${settings.theme === 'sepia' ? 'ring-2 ring-indigo-500 border-transparent' : 'border-stone-200 hover:brightness-95'}`}>
                                        <div className="w-4 h-4 rounded-full border border-stone-300 bg-[#f4ecd8]"></div>
                                    </button>
                                    <button onClick={() => updateSetting('theme', 'dark')} className={`flex-1 h-10 rounded-lg border flex items-center justify-center bg-slate-900 ${settings.theme === 'dark' ? 'ring-2 ring-indigo-500 border-transparent' : 'border-slate-800 hover:bg-slate-800'}`}>
                                        <div className="w-4 h-4 rounded-full border border-slate-600 bg-slate-800"></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="w-full p-6 md:p-8 space-y-8">
            
            {/* SOURCE TEXT CONTAINER WITH DYNAMIC STYLES */}
            {/* REFACTORED: Reference is now on the card wrapper, NOT inner content, to fix tooltip coordinates */}
            <div className="relative group" ref={textCardRef}>
                
                {/* Content Container with overflow-hidden for rounded corners & strip */}
                <div 
                    className={`px-8 py-8 rounded-2xl relative overflow-hidden transition-all duration-300 ${getThemeClasses()}`}
                    onMouseUp={handleTextMouseUp}
                    translate="no"
                >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 opacity-80"></div>
                    <div className={`absolute top-2 right-2 text-xs font-bold uppercase ${settings.theme === 'dark' ? 'text-slate-600' : 'text-slate-300'}`}>Source Text</div>
                    
                    <p className={`${settings.fontFamily} ${settings.fontSize} leading-loose ${language === 'zh' ? 'tracking-widest' : 'tracking-normal'}`}>
                        {lessonData.cleanedSourceText}
                    </p>
                </div>

                {/* Tooltip Render - NOW OUTSIDE OF OVERFLOW HIDDEN CONTAINER */}
                {selection.show && (
                    <div 
                        className={`absolute z-50 transform -translate-x-1/2 ${
                            selection.placement === 'top' ? '-translate-y-full' : ''
                        }`} 
                        style={{ top: selection.top, left: selection.left }}
                    >
                         <div className="relative flex flex-col items-center">
                            
                            {/* Arrow for Bottom Placement (Points Up) */}
                            {selection.placement === 'bottom' && (
                                <div className={`w-3 h-3 rotate-45 transform translate-y-1.5 ${getSelectionColor()}`}></div>
                            )}

                            {/* Tooltip Body */}
                            <div className={`${getSelectionColor()} text-white rounded-xl shadow-xl w-max max-w-[calc(100vw-3rem)] md:max-w-[320px]`}>
                                {selection.loading ? (
                                    <div className="px-4 py-2 text-sm font-bold animate-pulse">Đang tra từ...</div> 
                                ) : (
                                    selection.result && (
                                        <div className="px-4 py-3 text-center">
                                            <div className="text-sm font-bold whitespace-normal leading-relaxed">{selection.result}</div>
                                        </div>
                                    )
                                )}
                            </div>

                            {/* Arrow for Top Placement (Points Down) */}
                            {selection.placement === 'top' && (
                                <div className={`w-3 h-3 rotate-45 transform -translate-y-1.5 ${getSelectionColor()}`}></div>
                            )}

                         </div>
                    </div>
                )}
            </div>

            {/* TRANSLATION INPUT */}
            <div className="relative">
                <div className="absolute -top-3 left-4 bg-white px-2 z-10"><span className="text-xs font-bold text-slate-400 uppercase">Bản dịch của bạn</span></div>
                <textarea
                    ref={inputRef}
                    value={userTranslation}
                    onChange={(e) => setUserTranslation(e.target.value)}
                    placeholder="Gõ bản dịch..."
                    className="w-full p-6 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 min-h-[120px] text-lg"
                    disabled={showResult}
                />
            </div>

            {!showResult ? (
                <button onClick={handleCheck} disabled={userTranslation.length < 2} className="w-full bg-slate-900 text-white text-lg font-bold py-4 rounded-xl hover:bg-slate-800 transition-all shadow-lg">
                    ✨ Kiểm tra & Làm trắc nghiệm
                </button>
            ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    
                    {/* SCORE RESULT */}
                    {translationScore !== null && language !== 'zh' && (
                        <div className={`p-6 rounded-xl border ${getScoreColor(translationScore)} flex items-center justify-between`}>
                            <div>
                                <h4 className="font-bold text-lg mb-1">{getScoreLabel(translationScore)}</h4>
                                <p className="text-sm opacity-80">Độ chính xác so với bản dịch máy: {translationScore}%</p>
                            </div>
                            <div className="relative w-16 h-16 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-20" />
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray={176} strokeDashoffset={176 - (176 * translationScore) / 100} className="transition-all duration-1000 ease-out" />
                                </svg>
                                <span className="absolute font-bold text-sm">{translationScore}%</span>
                            </div>
                        </div>
                    )}

                    {/* REFERENCE TRANSLATION */}
                    {lessonData.referenceTranslation && language !== 'zh' && (
                        <div className="bg-green-50/50 border border-green-200 rounded-xl p-6">
                            <h4 className="text-xs font-bold text-green-700 uppercase mb-3">Đáp án tham khảo</h4>
                            <p className="text-green-900 text-lg leading-relaxed">{lessonData.referenceTranslation}</p>
                        </div>
                    )}

                    {/* QUIZ SECTION */}
                    {lessonData.quiz && lessonData.quiz.length > 0 && (
                        <div className="bg-indigo-50/30 border border-indigo-100 rounded-xl p-6">
                            <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                                <span>🧠</span> {language === 'zh' ? '閱讀測驗' : 'Trắc nghiệm Đọc hiểu'}
                            </h3>
                            
                            <div className="space-y-6">
                                {lessonData.quiz.map((q, qIdx) => (
                                    <div key={qIdx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <p className="font-bold text-slate-800 mb-4">{qIdx+1}. {q.question}</p>
                                        <div className="space-y-2">
                                            {q.options.map((opt, optIdx) => {
                                                const isSelected = quizAnswers[qIdx] === optIdx;
                                                const isCorrect = q.correctAnswer === optIdx;
                                                
                                                let btnClass = "w-full text-left p-3 rounded-lg border transition-all ";
                                                if (quizSubmitted) {
                                                    if (isCorrect) btnClass += "bg-green-100 border-green-500 text-green-800 font-bold";
                                                    else if (isSelected && !isCorrect) btnClass += "bg-red-50 border-red-300 text-red-700";
                                                    else btnClass += "bg-white border-slate-200 text-slate-400";
                                                } else {
                                                    if (isSelected) btnClass += "bg-indigo-100 border-indigo-500 text-indigo-900 font-bold";
                                                    else btnClass += "bg-white border-slate-200 hover:bg-slate-50 hover:border-indigo-300";
                                                }

                                                return (
                                                    <button 
                                                        key={optIdx} 
                                                        onClick={() => handleQuizSelect(qIdx, optIdx)}
                                                        className={btnClass}
                                                        disabled={quizSubmitted}
                                                    >
                                                        <span className="mr-2 font-mono">{String.fromCharCode(65+optIdx)}.</span>
                                                        {opt}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        {quizSubmitted && (
                                            <div className="mt-3 text-sm bg-blue-50 text-blue-800 p-3 rounded-lg">
                                                <strong>{language === 'zh' ? '解釋:' : 'Giải thích:'}</strong> {q.explanation}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {!quizSubmitted && (
                                <button 
                                    onClick={() => setQuizSubmitted(true)}
                                    disabled={quizAnswers.length < lessonData.quiz.length}
                                    className="mt-4 px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {language === 'zh' ? '提交' : 'Nộp bài Trắc nghiệm'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* FOOTER ACTIONS */}
                    <div className="flex gap-4 pt-4 border-t border-slate-100">
                         <button onClick={() => { setShowResult(false); setQuizSubmitted(false); setQuizAnswers([]); }} className="flex-1 bg-white border border-slate-300 py-3 rounded-xl font-bold hover:bg-slate-50">
                            {language === 'zh' ? '重做' : 'Làm lại'}
                        </button>
                        <button onClick={handleFinishChunk} disabled={!quizSubmitted && lessonData.quiz?.length > 0} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg disabled:opacity-50">
                            {isLast ? (language === 'zh' ? '完成' : 'Hoàn thành bài học') : (language === 'zh' ? '下一段 →' : 'Tiếp tục đoạn sau →')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
