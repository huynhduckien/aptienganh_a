
import React, { useState, useEffect, useRef } from 'react';
import { ProcessedChunk, LessonContent, DictionaryResponse } from '../types';
import { explainPhrase } from '../services/geminiService';

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
    result?: DictionaryResponse; // Lưu trữ toàn bộ kết quả tra cứu
    placement: 'top' | 'bottom';
    isSaved: boolean; // Trạng thái đã nhấn lưu hay chưa
}

type ThemeMode = 'light' | 'sepia' | 'dark';
type FontFamily = 'font-serif' | 'font-sans';
type FontSize = 'text-base' | 'text-lg' | 'text-xl' | 'text-2xl' | 'text-3xl';

interface ReadingSettings {
    theme: ThemeMode;
    fontFamily: FontFamily;
    fontSize: FontSize;
}

export const LessonView: React.FC<LessonViewProps> = ({ chunk, language, totalChunks, onComplete, onNext, onLookup, onContentUpdate, isLast }) => {
  const [userTranslation, setUserTranslation] = useState('');
  const [selection, setSelection] = useState<SelectionState>({ 
      text: '', top: 0, left: 0, show: false, loading: false, placement: 'top', isSaved: false
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
    setSelection({ text: '', top: 0, left: 0, show: false, loading: false, placement: 'top', isSaved: false });
    setShowSettings(false);
  }, [chunk.id]);

  const handleTextMouseUp = () => {
      const winSelection = window.getSelection();
      if (!winSelection || winSelection.isCollapsed) {
          if (selection.show && !selection.loading) setSelection(prev => ({ ...prev, show: false }));
          return;
      }
      const text = winSelection.toString().trim();
      // Giới hạn độ dài để tránh tra cứu cả đoạn văn dài
      if (text.length > 0 && text.split(/\s+/).length <= 15) {
          const range = winSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = textCardRef.current?.getBoundingClientRect();
          if (containerRect) {
            const placement = rect.top < 160 ? 'bottom' : 'top';
            let top = placement === 'top' ? rect.top - containerRect.top - 12 : rect.bottom - containerRect.top + 12;
            setSelection({ text, top, left: rect.left - containerRect.left + (rect.width / 2), show: true, loading: true, placement, isSaved: false });
            performLookup(text);
          }
      }
  };

  const performLookup = async (text: string) => {
      try {
          const result = await explainPhrase(text, chunk.text);
          // Không gọi onLookup tự động nữa, chỉ lưu kết quả vào state để hiển thị
          setSelection(prev => (prev.text === text && prev.show) ? { ...prev, loading: false, result } : prev);
      } catch (e) {
          setSelection(prev => ({ ...prev, loading: false, show: false }));
      }
  };

  const handleSaveCard = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!selection.result || selection.isSaved) return;
      
      onLookup(
          selection.text, 
          selection.result.shortMeaning, 
          selection.result.detailedExplanation, 
          selection.result.phonetic
      );
      setSelection(prev => ({ ...prev, isSaved: true }));
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
  
  const getSelectionColor = () => settings.theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-900'; 

  return (
    <div className="max-w-7xl mx-auto w-full px-4 md:px-6 mb-12">
      <div className="bg-white rounded-[48px] shadow-2xl shadow-indigo-100/50 border border-slate-200 flex flex-col relative animate-in fade-in duration-500 overflow-hidden">
        
        {/* HEADER SECTION */}
        <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 backdrop-blur-md z-10">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-2xl border border-slate-100">
                  ✍️
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-[0.15em]">Luyện dịch chuyên sâu</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Bôi đen từ để tra cứu & Lưu thẻ vựng</p>
                </div>
            </div>
            <div className="flex items-center gap-4">
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
        <div className={`flex-1 grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-slate-100 p-0`}>
            
            {/* LEFT: SOURCE TEXT */}
            <div className={`p-8 md:p-12 overflow-y-auto custom-scrollbar lg:sticky lg:top-0 lg:max-h-[calc(100vh-200px)]`}>
                <div className="relative group" ref={textCardRef}>
                    <div className={`px-12 py-14 rounded-[40px] relative overflow-hidden transition-all duration-300 ${getThemeClasses()} border-2 min-h-[400px]`} onMouseUp={handleTextMouseUp} translate="no">
                        <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-indigo-500/30"></div>
                        <div className={`absolute top-6 right-10 text-[10px] font-black uppercase tracking-[0.3em] ${settings.theme === 'dark' ? 'text-slate-600' : 'text-slate-300'}`}>DOCUMENT</div>
                        
                        <p className={`${settings.fontFamily} ${settings.fontSize} leading-[2.1] text-justify hyphens-auto break-words ${language === 'zh' ? 'tracking-widest' : 'tracking-normal'}`}>
                          {chunk.text}
                        </p>
                    </div>

                    {/* Dictionary Lookup Tooltip */}
                    {selection.show && (
                        <div className={`absolute z-50 transform -translate-x-1/2 ${selection.placement === 'top' ? '-translate-y-full' : ''}`} style={{ top: selection.top, left: selection.left }}>
                             <div className="relative flex flex-col items-center">
                                {selection.placement === 'bottom' && <div className={`w-3 h-3 rotate-45 transform translate-y-1.5 ${getSelectionColor()}`}></div>}
                                <div className={`${getSelectionColor()} text-white rounded-[24px] shadow-2xl w-max min-w-[200px] max-w-[340px] px-6 py-5 text-left ring-8 ring-white/5 border border-white/10`}>
                                    {selection.loading ? 
                                      <div className="flex items-center justify-center gap-3 text-xs font-black animate-pulse py-2">
                                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> 
                                        ĐANG TRA TỪ...
                                      </div> 
                                      : (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-start gap-4">
                                                <div>
                                                    <div className="text-xs font-black opacity-50 uppercase tracking-widest mb-1">{selection.text}</div>
                                                    {selection.result?.phonetic && <div className="text-[10px] font-mono opacity-80">/{selection.result.phonetic}/</div>}
                                                </div>
                                                <button 
                                                    onClick={handleSaveCard}
                                                    disabled={selection.isSaved}
                                                    className={`p-2 rounded-xl transition-all flex items-center gap-2 ${selection.isSaved ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                                    title={selection.isSaved ? "Đã lưu" : "Lưu vào bộ thẻ"}
                                                >
                                                    {selection.isSaved ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                                    )}
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{selection.isSaved ? "ĐÃ LƯU" : "LƯU THẺ"}</span>
                                                </button>
                                            </div>
                                            <div className="h-[1px] bg-white/10 w-full"></div>
                                            <div className="text-sm font-bold whitespace-normal leading-relaxed">
                                                {selection.result?.shortMeaning || "Không tìm thấy nghĩa."}
                                            </div>
                                        </div>
                                      )
                                    }
                                </div>
                                {selection.placement === 'top' && <div className={`w-3 h-3 rotate-45 transform -translate-y-1.5 ${getSelectionColor()}`}></div>}
                             </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: EDITOR AREA */}
            <div className={`p-8 md:p-12 flex flex-col bg-white`}>
                <div className="relative flex-1">
                    <div className="absolute -top-3 left-8 bg-white px-3 py-0.5 rounded-full border border-slate-100 z-10">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Khu vực soạn thảo bản dịch</span>
                    </div>
                    <textarea 
                        ref={inputRef} 
                        value={userTranslation} 
                        onChange={(e) => setUserTranslation(e.target.value)} 
                        placeholder="Ghi lại bản dịch hoặc ý tưởng của bạn tại đây..." 
                        className={`w-full p-10 rounded-[40px] border-2 border-slate-100 bg-slate-50/20 focus:bg-white focus:border-indigo-500 focus:ring-8 focus:ring-indigo-500/5 transition-all text-xl leading-[1.8] placeholder:text-slate-300 min-h-[500px]`} 
                    />
                </div>
            </div>
        </div>

        {/* FOOTER ACTION AREA */}
        <div className="px-10 py-10 bg-slate-50/80 border-t border-slate-100 flex flex-col items-center justify-center gap-6">
            <div className="w-full max-w-2xl text-center space-y-6">
                <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Bạn đã hoàn thành phần luyện tập này?</p>
                <button 
                  onClick={handleFinishChunk} 
                  className="w-full bg-indigo-600 text-white text-xl font-black py-7 rounded-[32px] shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                    HOÀN THÀNH VÀ TIẾP TỤC
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
