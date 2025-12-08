
import React, { useState, useEffect } from 'react';
import { SavedPaper } from '../types';

interface DashboardProps {
  papers: SavedPaper[];
  onOpenPaper: (paper: SavedPaper) => void;
  onDeletePaper: (id: string) => void;
  // REMOVED: onNewPaper prop
  onOpenFlashcards: () => void;
  // Sync props
  syncKey: string | null;
  onSetSyncKey: (key: string) => void;
  onOpenAdmin: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
    papers, onOpenPaper, onDeletePaper, onOpenFlashcards,
    syncKey, onSetSyncKey, onOpenAdmin
}) => {
  const [inputKey, setInputKey] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPass, setAdminPass] = useState('');

  const handleSyncLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if(inputKey.trim()) onSetSyncKey(inputKey.trim());
  };

  const handleAdminLogin = (e: React.FormEvent) => {
      e.preventDefault();
      // Mật khẩu đơn giản hardcode (có thể đổi)
      if (adminPass === 'admin123') {
          onOpenAdmin();
          setAdminPass('');
          setAdminMode(false);
      } else {
          alert("Sai mật khẩu quản trị!");
      }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 animate-in fade-in duration-500">
      
      {/* --- STUDENT LOGIN SECTION --- */}
      {!syncKey ? (
          <div className="mb-12 bg-indigo-900 rounded-3xl p-8 md:p-12 text-white shadow-2xl relative overflow-hidden">
              {/* Background Decoration */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white opacity-5"></div>
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-indigo-500 opacity-20"></div>

              <div className="relative z-10 max-w-2xl">
                  <h2 className="text-3xl font-bold mb-4">Chào mừng học viên! 👋</h2>
                  <p className="text-indigo-200 mb-8 text-lg">
                      Vui lòng nhập <span className="font-bold text-white">Mã Học Viên</span> do giáo viên cung cấp để đồng bộ dữ liệu bài học và flashcards của riêng bạn.
                  </p>

                  <form onSubmit={handleSyncLogin} className="flex flex-col sm:flex-row gap-4">
                      <input 
                        type="text" 
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="Nhập mã (VD: hieu-8392)"
                        className="flex-1 px-6 py-4 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-4 focus:ring-indigo-400 placeholder:text-slate-400 placeholder:font-normal"
                      />
                      <button 
                        type="submit"
                        className="px-8 py-4 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/50"
                      >
                        Kích hoạt
                      </button>
                  </form>
                  
                  <div className="mt-6 flex items-center gap-2">
                       <button 
                         onClick={() => setAdminMode(!adminMode)}
                         className="text-xs text-indigo-400 hover:text-white underline opacity-60"
                       >
                           {adminMode ? 'Hủy đăng nhập quản trị' : 'Dành cho Quản Trị Viên'}
                       </button>
                  </div>

                  {adminMode && (
                      <form onSubmit={handleAdminLogin} className="mt-4 flex gap-2 animate-in slide-in-from-top-2">
                          <input 
                            type="password" 
                            value={adminPass}
                            onChange={(e) => setAdminPass(e.target.value)}
                            placeholder="Mật khẩu Admin"
                            className="px-3 py-2 rounded-lg text-slate-900 text-sm w-40"
                          />
                          <button type="submit" className="px-3 py-2 bg-slate-700 rounded-lg text-sm font-bold">Vào</button>
                      </form>
                  )}
              </div>
          </div>
      ) : (
          /* Logged In Info Bar */
          <div className="mb-10 flex justify-between items-center bg-indigo-50 px-6 py-4 rounded-2xl border border-indigo-100">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center font-bold text-lg">
                      {syncKey.charAt(0).toUpperCase()}
                  </div>
                  <div>
                      <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Tài khoản học viên</div>
                      <div className="font-bold text-indigo-900 font-mono">{syncKey}</div>
                  </div>
              </div>
              <div className="flex gap-4">
                   <button 
                     onClick={() => {
                        if(confirm('Đăng xuất khỏi tài khoản này?')) {
                            onSetSyncKey('');
                        }
                     }}
                     className="text-sm font-bold text-slate-400 hover:text-red-500"
                   >
                       Đăng xuất
                   </button>
                   {/* Nút Admin ẩn nhẹ ở đây để tiện truy cập nếu cần */}
                   <button onClick={() => setAdminMode(true)} className="text-slate-300 hover:text-slate-500" title="Admin">⚙️</button>
              </div>
          </div>
      )}
      
      {/* Admin Quick Login Modal from logged in state */}
      {adminMode && syncKey && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
             <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm">
                 <h3 className="font-bold text-lg mb-4">Đăng nhập Admin</h3>
                 <form onSubmit={handleAdminLogin} className="flex flex-col gap-3">
                    <input 
                        type="password" 
                        value={adminPass}
                        onChange={(e) => setAdminPass(e.target.value)}
                        placeholder="Mật khẩu..."
                        className="px-4 py-2 border rounded-lg"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAdminMode(false)} className="px-4 py-2 text-slate-500">Hủy</button>
                        <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg">Đăng nhập</button>
                    </div>
                 </form>
             </div>
         </div>
      )}

      {/* Main Dashboard Content */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Thư viện của bạn</h1>
          <p className="text-slate-500">Quản lý các bài báo khoa học và tiếp tục học bất cứ lúc nào.</p>
        </div>
        
        <div className="flex gap-4">
            <button 
                onClick={onOpenFlashcards}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-orange-200 text-orange-600 font-bold rounded-xl hover:bg-orange-50 hover:border-orange-300 transition-all shadow-sm"
            >
                <span>📚</span> Flashcards
            </button>
            {/* REMOVED: "Thêm bài mới" Button */}
        </div>
      </div>

      {/* Grid of Papers */}
      {papers.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
           <div className="text-6xl mb-4">📂</div>
           <h3 className="text-xl font-bold text-slate-700 mb-2">Thư viện trống</h3>
           <p className="text-slate-400 mb-6">Hiện chưa có bài báo nào được giao.</p>
           {/* REMOVED: "Tải lên ngay" Button */}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {papers.map((paper) => {
                const completed = paper.processedChunks.filter(c => c.isCompleted).length;
                const total = paper.processedChunks.length;
                const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                    <div key={paper.id} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:border-indigo-200 transition-all group relative flex flex-col h-full cursor-pointer" onClick={() => onOpenPaper(paper)}>
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDeletePaper(paper.id); }}
                                    className="text-slate-300 hover:text-red-500 p-2 z-10 relative"
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
