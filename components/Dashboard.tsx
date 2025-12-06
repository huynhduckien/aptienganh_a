
import React from 'react';
import { SavedPaper } from '../types';

interface DashboardProps {
  papers: SavedPaper[];
  onOpenPaper: (paper: SavedPaper) => void;
  onDeletePaper: (id: string) => void;
  onNewPaper: () => void;
  onOpenFlashcards: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ papers, onOpenPaper, onDeletePaper, onNewPaper, onOpenFlashcards }) => {
  return (
    <div className="max-w-5xl mx-auto py-12 px-4 animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Thư viện của bạn</h1>
          <p className="text-slate-500">Quản lý các bài báo khoa học và tiếp tục học bất cứ lúc nào.</p>
        </div>
        
        <div className="flex gap-4">
            <button 
                onClick={onOpenFlashcards}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-orange-200 text-orange-600 font-bold rounded-xl hover:bg-orange-50 hover:border-orange-300 transition-all shadow-sm"
            >
                <span>📚</span> Flashcards
            </button>
            <button 
                onClick={onNewPaper}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
            >
                <span>+</span> Thêm bài mới
            </button>
        </div>
      </div>

      {/* Grid of Papers */}
      {papers.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
           <div className="text-6xl mb-4">📂</div>
           <h3 className="text-xl font-bold text-slate-700 mb-2">Chưa có bài báo nào</h3>
           <p className="text-slate-400 mb-6">Hãy tải lên file PDF đầu tiên để bắt đầu học.</p>
           <button onClick={onNewPaper} className="text-indigo-600 font-bold hover:underline">Tải lên ngay</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {papers.map((paper) => {
                const completed = paper.processedChunks.filter(c => c.isCompleted).length;
                const total = paper.processedChunks.length;
                const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                    <div key={paper.id} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:border-indigo-200 transition-all group relative flex flex-col h-full">
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDeletePaper(paper.id); }}
                                    className="text-slate-300 hover:text-red-500 p-2"
                                    title="Xóa bài này"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            </div>
                            
                            <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-2" title={paper.fileName}>{paper.fileName}</h3>
                            <p className="text-xs text-slate-400 font-medium mb-6">
                                Truy cập lần cuối: {new Date(paper.lastOpened).toLocaleDateString('vi-VN')}
                            </p>
                        </div>

                        <div>
                            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
                                <span>Tiến độ</span>
                                <span>{percent}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 mb-6 overflow-hidden">
                                <div 
                                    className="bg-indigo-500 h-2 rounded-full transition-all duration-500" 
                                    style={{ width: `${percent}%` }}
                                ></div>
                            </div>
                            
                            <button 
                                onClick={() => onOpenPaper(paper)}
                                className="w-full py-3 bg-slate-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 hover:ring-2 hover:ring-indigo-100 transition-all"
                            >
                                Tiếp tục học
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
      )}
    </div>
  );
};
