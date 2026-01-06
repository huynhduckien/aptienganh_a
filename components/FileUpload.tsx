
import React, { useState } from 'react';
import { extractTextFromPdf } from '../services/pdfService';

interface FileUploadProps {
  onTextExtracted: (text: string, filename: string, language: 'en' | 'zh') => void;
  isProcessing?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onTextExtracted, isProcessing = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'zh'>('en');

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Vui lòng chỉ tải lên tệp PDF.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const text = await extractTextFromPdf(file);
      if (text.length < 50) {
        throw new Error("Không tìm thấy văn bản nào có thể đọc được trong PDF này.");
      }
      onTextExtracted(text, file.name, language);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi đọc file PDF. Hãy chắc chắn đây là file chứa văn bản (không phải ảnh scan).');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] p-4 animate-in fade-in zoom-in duration-500">
      <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 mb-6 flex gap-1">
          <button 
            onClick={() => setLanguage('en')}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${language === 'en' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
              🇬🇧 English PDF
          </button>
          <button 
            onClick={() => setLanguage('zh')}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${language === 'zh' ? 'bg-red-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
              🇨🇳 Chinese PDF
          </button>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          w-full max-w-xl p-12 rounded-[32px] border-4 border-dashed transition-all duration-300
          flex flex-col items-center justify-center text-center cursor-pointer bg-white
          ${isDragging 
            ? 'border-indigo-400 bg-indigo-50 scale-105' 
            : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
          }
        `}
      >
        <input
          type="file"
          id="fileInput"
          className="hidden"
          accept="application/pdf"
          onChange={handleInputChange}
          disabled={isLoading || isProcessing}
        />
        
        <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center w-full h-full">
            {isLoading || isProcessing ? (
                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-16 w-16 mb-4 ${language==='en'?'text-indigo-400':'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
            )}
          
          <span className="text-lg font-black text-slate-700">
            {isLoading || isProcessing ? 'Đang phân tách văn bản...' : 'Tải lên bài báo PDF'}
          </span>
          <span className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">
            {language === 'en' ? 'Tự động chia nhỏ nội dung Anh ngữ' : 'Hỗ trợ văn bản tiếng Trung Phồn thể'}
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center font-bold text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
        </div>
      )}
    </div>
  );
};
