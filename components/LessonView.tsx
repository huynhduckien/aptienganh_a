
import React, { useState, useEffect, useRef } from 'react';
import { ProcessedChunk, QuizQuestion } from '../types';
import { generateLessonForChunk, explainPhrase } from '../services/geminiService';

interface LessonViewProps {
  chunk: ProcessedChunk;
  totalChunks: number;
  language: 'en' | 'zh'; // NEW prop
  onComplete: (chunkId: number) => void;
  onNext: () => void;
  onLookup: (term: string, meaning: string, explanation: string, phonetic: string) => void;
  isLast: boolean;
}

interface SelectionState {
    text: string; top: number; left: number; show: boolean; loading: boolean; result?: string;
}

export const LessonView: React.FC<LessonViewProps> = ({ chunk, language, totalChunks, onComplete, onNext, onLookup, isLast }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonData, setLessonData] = useState(chunk.content);
  
  // Translation State
  const [userTranslation, setUserTranslation] = useState('');
  const [translationScore, setTranslationScore] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Quiz State
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]); // User selected index
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Selection State
  const [selection, setSelection] = useState<SelectionState>({ text: '', top: 0, left: 0, show: false, loading: false });
  const textContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setUserTranslation('');
    setTranslationScore(null);
    setShowResult(false);
    setQuizAnswers([]); 
    setQuizSubmitted(false);
    setError(null);
    setSelection({ text: '', top: 0, left: 0, show: false, loading: false });
    
    setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 100);
    
    if (chunk.content) {
      setLessonData(chunk.content);
      setLoading(false);
    } else {
      fetchAIContent();
    }
  }, [chunk.id]);

  const fetchAIContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateLessonForChunk(chunk.text, language);
      setLessonData(data);
    } catch (e: any) {
      console.error(e);
      setError("Lỗi kết nối nghiêm trọng.");
    } finally {
      setLoading(false);
    }
  };

  // --- Selection Logic (Keep existing) ---
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
          const rect = range.getBoundingClientRect();
          const containerRect = textContainerRef.current?.getBoundingClientRect();
          if (containerRect) {
            setSelection({
                text,
                top: rect.top - containerRect.top - 15,
                left: rect.left - containerRect.left + (rect.width / 2),
                show: true, loading: true, result: undefined 
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

  // --- Quiz Logic ---
  const handleQuizSelect = (qIndex: number, optionIndex: number) => {
      if (quizSubmitted) return;
      setQuizAnswers(prev => {
          const newAnswers = [...prev];
          newAnswers[qIndex] = optionIndex;
          return newAnswers;
      });
  };

  // --- Check Logic ---
  const handleCheck = () => {
      if (!lessonData) return;
      const score = 100; // Mock score logic, simplify for now
      setTranslationScore(score);
      setShowResult(true);
  };

  const handleFinishChunk = () => {
      onComplete(chunk.id);
      if (!isLast) onNext();
  };

  const isFallbackMode = lessonData?.source === 'Fallback';

  if (loading) return <div className="h-96 flex items-center justify-center bg-white rounded-2xl border"><div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div></div>;
  if (!lessonData) return null;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col relative">
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-3xl">
             <div className="flex items-center gap-2">
                <span className="text-2xl">📖</span>
                <h2 className="text-lg font-bold text-slate-800">Reading & Quiz</h2>
            </div>
            <div className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1 ${isFallbackMode ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                {isFallbackMode ? 'Chế độ dự phòng' : 'AI Gemini Mode'}
            </div>
        </div>

        <div className="w-full p-6 md:p-8 space-y-8" ref={textContainerRef}>
            
            {/* SOURCE TEXT */}
            <div className="relative group">
                <div 
                    className="bg-[#fdfbf7] px-8 py-8 rounded-2xl border border-stone-200 shadow-inner relative overflow-hidden"
                    onMouseUp={handleTextMouseUp}
                    translate="no"
                >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 opacity-80"></div>
                    <div className="absolute top-2 right-2 text-xs font-bold text-slate-300 uppercase">Source Text</div>
                    
                    <p className={`font-serif text-[1.35rem] leading-loose text-slate-800 ${language === 'zh' ? 'tracking-widest' : 'tracking-normal'}`}>
                        {lessonData.cleanedSourceText}
                    </p>
                </div>
                {/* Tooltip Render (Same as before) */}
                {selection.show && (
                    <div className="absolute z-50 transform -translate-x-1/2 -translate-y-full" style={{ top: selection.top, left: selection.left }}>
                         {selection.loading ? <div className="bg-slate-900 text-white px-3 py-1 rounded-full">...</div> : 
                          selection.result && <div className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold max-w-[250px]">{selection.result}</div>}
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
                    
                    {/* REFERENCE TRANSLATION */}
                    <div className="bg-green-50/50 border border-green-200 rounded-xl p-6">
                        <h4 className="text-xs font-bold text-green-700 uppercase mb-3">Đáp án tham khảo</h4>
                        <p className="text-green-900 text-lg leading-relaxed">{lessonData.referenceTranslation}</p>
                    </div>

                    {/* QUIZ SECTION */}
                    {lessonData.quiz && lessonData.quiz.length > 0 && (
                        <div className="bg-indigo-50/30 border border-indigo-100 rounded-xl p-6">
                            <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                                <span>🧠</span> Trắc nghiệm Đọc hiểu
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
                                                <strong>Giải thích:</strong> {q.explanation}
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
                                    Nộp bài Trắc nghiệm
                                </button>
                            )}
                        </div>
                    )}

                    {/* FOOTER ACTIONS */}
                    <div className="flex gap-4 pt-4 border-t border-slate-100">
                         <button onClick={() => { setShowResult(false); setQuizSubmitted(false); setQuizAnswers([]); }} className="flex-1 bg-white border border-slate-300 py-3 rounded-xl font-bold hover:bg-slate-50">
                            Làm lại
                        </button>
                        <button onClick={handleFinishChunk} disabled={!quizSubmitted && lessonData.quiz?.length > 0} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg disabled:opacity-50">
                            {isLast ? 'Hoàn thành bài học' : 'Tiếp tục đoạn sau →'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
