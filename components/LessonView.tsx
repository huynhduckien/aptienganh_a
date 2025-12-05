
import React, { useState, useEffect, useRef } from 'react';
import { ProcessedChunk } from '../types';
import { generateLessonForChunk, explainPhrase } from '../services/geminiService';

interface LessonViewProps {
  chunk: ProcessedChunk;
  totalChunks: number;
  onComplete: (chunkId: number) => void;
  onNext: () => void;
  onLookup: (term: string, meaning: string, explanation: string, phonetic: string) => void;
  isLast: boolean;
}

interface SelectionState {
    text: string;
    top: number;
    left: number;
    show: boolean;
    loading: boolean;
    result?: string; // Store the short meaning here
    phonetic?: string;
}

export const LessonView: React.FC<LessonViewProps> = ({ chunk, totalChunks, onComplete, onNext, onLookup, isLast }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonData, setLessonData] = useState(chunk.content);
  
  const [userTranslation, setUserTranslation] = useState('');
  const [translationScore, setTranslationScore] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Text Selection State
  const [selection, setSelection] = useState<SelectionState>({
      text: '', top: 0, left: 0, show: false, loading: false
  });
  const textContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setUserTranslation('');
    setTranslationScore(null);
    setShowResult(false);
    setError(null);
    setSelection({ text: '', top: 0, left: 0, show: false, loading: false });
    
    // Focus input automatically for better flow
    setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
    }, 100);
    
    if (chunk.content) {
      setLessonData(chunk.content);
      setLoading(false);
    } else {
      fetchAIContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunk.id]);

  const fetchAIContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateLessonForChunk(chunk.text);
      setLessonData(data);
    } catch (e: any) {
      console.error(e);
      let msg = "Có lỗi xảy ra khi tải bài dịch.";
      if (e.message?.includes('quota') || e.message?.includes('429')) {
          msg = "Hệ thống đang quá tải (Limit Quota). Vui lòng đợi giây lát và thử lại.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
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

  // --- Selection Logic ---
  const handleTextMouseUp = () => {
      const winSelection = window.getSelection();
      if (!winSelection || winSelection.isCollapsed) {
          if (selection.show && !selection.loading) {
               setSelection(prev => ({ ...prev, show: false }));
          }
          return;
      }

      const text = winSelection.toString().trim();
      const wordCount = text.split(/\s+/).length;

      // Allow lookup if 1-6 words
      if (text.length > 0 && wordCount <= 6) {
          const range = winSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = textContainerRef.current?.getBoundingClientRect();
          
          if (containerRect) {
            // Auto trigger lookup
            setSelection({
                text,
                top: rect.top - containerRect.top - 15, // Just above the text with a bit more offset
                left: rect.left - containerRect.left + (rect.width / 2),
                show: true,
                loading: true,
                result: undefined 
            });
            
            performLookup(text);
          }
      }
  };

  const performLookup = async (text: string) => {
      try {
          const context = lessonData?.cleanedSourceText || chunk.text;
          const result = await explainPhrase(text, context);
          
          // Send detailed info to parent (Sidebar)
          onLookup(text, result.shortMeaning, result.detailedExplanation, result.phonetic);
          
          setSelection(prev => {
              if (prev.text === text && prev.show) {
                  return { ...prev, loading: false, result: result.shortMeaning, phonetic: result.phonetic };
              }
              return prev;
          });
      } catch (e) {
          setSelection(prev => ({ ...prev, loading: false, show: false }));
      }
  };

  const closeSelection = () => {
      setSelection(prev => ({ ...prev, show: false, result: undefined }));
      window.getSelection()?.removeAllRanges();
  };

  // --- Comparison Logic ---
  const calculateSimilarity = (str1: string, str2: string) => {
      const normalize = (s: string) => s.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim().split(/\s+/).filter(w => w.length > 0);
      const s1 = normalize(str1);
      const s2 = normalize(str2);
      
      const set1 = new Set(s1);
      const set2 = new Set(s2);
      
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      
      if (union.size === 0) return 0;
      return Math.round((intersection.size / union.size) * 100);
  };

  const handleCheck = () => {
      if (!lessonData) return;
      const score = calculateSimilarity(userTranslation, lessonData.referenceTranslation);
      setTranslationScore(score);
      setShowResult(true);
  };

  const handleFinishChunk = () => {
      onComplete(chunk.id);
      if (!isLast) {
          onNext();
      }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 bg-white rounded-2xl border border-slate-200">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">AI đang chuẩn bị bài dịch...</p>
        <p className="text-xs text-slate-400">Nếu quá lâu, hệ thống có thể đang thử lại do quá tải.</p>
      </div>
    );
  }

  if (error || !lessonData) {
      return (
        <div className="flex flex-col items-center justify-center h-96 space-y-4 bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <div className="text-4xl">⚠️</div>
            <h3 className="text-lg font-bold text-slate-800">Không thể tải nội dung</h3>
            <p className="text-slate-500 max-w-md">{error || "Đã xảy ra lỗi không xác định."}</p>
            <button 
                onClick={fetchAIContent}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
            >
                Thử lại ngay
            </button>
        </div>
      );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-visible min-h-[500px] flex flex-col p-6 md:p-10 relative">
        
        {/* Header */}
        <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center justify-center gap-2">
                <span className="text-2xl">✍️</span>
                Luyện Dịch
            </h2>
        </div>

        <div className="w-full space-y-6" ref={textContainerRef}>
            
            {/* Source Text Box - Now cleaner */}
            <div className="relative group">
                <div 
                    className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all selection:bg-green-200 selection:text-green-900"
                    onMouseUp={handleTextMouseUp}
                >
                    <p className="font-serif text-2xl leading-loose text-slate-800 tracking-wide">
                        {lessonData.cleanedSourceText || chunk.text}
                    </p>
                </div>

                {/* Selection Popover / Result Tooltip */}
                {selection.show && (
                    <div 
                        className="absolute z-50 transform -translate-x-1/2 -translate-y-full transition-all duration-200"
                        style={{ top: selection.top, left: selection.left }}
                    >
                        {selection.loading ? (
                             <div className="mb-2 bg-slate-800 text-white px-4 py-2 rounded-full shadow-xl flex items-center space-x-2 border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                <span className="text-sm font-medium whitespace-nowrap">Đang tra...</span>
                            </div>
                        ) : selection.result ? (
                            <div className="mb-2 max-w-sm w-max animate-in fade-in zoom-in-95 duration-200">
                                <div className="bg-white text-slate-800 px-5 py-3 rounded-2xl shadow-xl border-2 border-green-400 relative flex items-start gap-3">
                                    <div className="flex-1">
                                        <div className="font-bold text-lg text-green-700 mb-0.5">{selection.result}</div>
                                        <div className="text-xs text-slate-400 font-bold tracking-wider border-t border-slate-100 pt-1 mt-1 flex items-center gap-1">
                                            {selection.text}
                                            {selection.phonetic && <span className="text-slate-400 font-normal normal-case">/{selection.phonetic}/</span>}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); playAudio(selection.text); }}
                                                className="ml-1 text-slate-400 hover:text-green-600 p-0.5 rounded-full hover:bg-green-50 transition-colors"
                                                title="Nghe phát âm"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                    <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318 0-2.402.933l-.034 6.911c.088 1.126 1.449 1.156 2.451 1.156H6.44l4.5 4.5c.945.945 2.56.276 2.56-1.06V4.06zM17.786 7.158c.391-.391 1.024-.391 1.414 0 2.228 2.229 2.228 5.842 0 8.071-.39.39-1.023.39-1.414 0-.39-.39-.39-1.023 0-1.414 1.447-1.447 1.447-3.793 0-5.24-.391-.391-.391-1.024 0-1.414z" />
                                                    <path d="M15.665 9.279c.391-.391 1.024-.391 1.414 0 .902.902.902 2.365 0 3.267-.39.39-1.023.39-1.414 0-.39-.39-.39-1.023 0-1.414.121-.121.121-.318 0-.439-.391-.391-.391-1.024 0-1.414z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={closeSelection}
                                        className="text-slate-300 hover:text-slate-500 -mr-2 -mt-2 p-1 rounded-full hover:bg-slate-50"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="absolute left-1/2 -translate-x-1/2 -bottom-2.5 w-5 h-5 bg-white border-r-2 border-b-2 border-green-400 transform rotate-45"></div>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            {/* Input Box */}
            <div>
                <textarea
                    ref={inputRef}
                    value={userTranslation}
                    onChange={(e) => setUserTranslation(e.target.value)}
                    placeholder="Gõ bản dịch của bạn vào đây..."
                    className="w-full p-6 md:p-8 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all min-h-[160px] text-xl leading-loose font-medium text-slate-700 resize-none shadow-sm placeholder:text-slate-300 placeholder:font-normal"
                    disabled={showResult}
                />
            </div>

            {/* Actions */}
            {!showResult ? (
                <button 
                    onClick={handleCheck}
                    disabled={userTranslation.length < 5}
                    className="w-full bg-indigo-600 text-white text-xl font-bold py-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200 mt-2"
                >
                    Kiểm tra độ chính xác
                </button>
            ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Score Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
                        <span className="font-bold text-slate-600 text-lg">Độ chính xác tương đồng:</span>
                        <div className="flex items-center space-x-2">
                             <span className={`text-4xl font-black ${translationScore! > 70 ? 'text-green-600' : translationScore! > 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                                {translationScore}%
                            </span>
                        </div>
                    </div>

                    {/* Reference Translation */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-8">
                        <h4 className="text-xs font-bold text-green-700 uppercase tracking-wider mb-4">Đáp án tham khảo (Reference)</h4>
                        <p className="text-green-900 text-xl leading-loose font-serif">
                            {lessonData.referenceTranslation}
                        </p>
                    </div>

                    {/* Key Terms */}
                    {lessonData.keyTerms && lessonData.keyTerms.length > 0 && (
                         <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Từ vựng quan trọng</h4>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {lessonData.keyTerms.map((item, idx) => (
                                    <div key={idx} className="bg-white p-4 rounded-lg border border-slate-100 text-base shadow-sm">
                                        <div className="font-bold text-indigo-700 mb-1">{item.term}</div>
                                        <div className="text-slate-600 leading-relaxed">{item.meaning}</div>
                                    </div>
                                ))}
                            </div>
                         </div>
                    )}

                    <div className="flex gap-4 pt-4">
                         <button 
                            onClick={() => {
                                setShowResult(false);
                                setUserTranslation('');
                                setTranslationScore(null);
                                setTimeout(() => inputRef.current?.focus(), 100);
                            }}
                            className="flex-1 bg-white border border-slate-300 text-slate-700 py-4 rounded-xl font-bold hover:bg-slate-50 text-lg"
                        >
                            Làm lại
                        </button>
                        <button 
                            onClick={handleFinishChunk}
                            className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex justify-center items-center text-lg"
                        >
                            {isLast ? 'Hoàn thành' : 'Tiếp tục đoạn sau'}
                             {!isLast && (
                                <svg className="w-6 h-6 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                             )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
