
import React, { useState, useEffect } from 'react';
import { createStudentAccount, getAllStudents } from '../services/firebaseService';
import { StudentAccount } from '../types';

interface AdminPanelProps {
    onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
    const [students, setStudents] = useState<StudentAccount[]>([]);
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(false);
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);

    useEffect(() => {
        loadStudents();
    }, []);

    const loadStudents = async () => {
        const list = await getAllStudents();
        // Sắp xếp mới nhất lên đầu
        setStudents(list.sort((a, b) => b.createdAt - a.createdAt));
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setLoading(true);
        try {
            const student = await createStudentAccount(newName);
            setGeneratedKey(student.key);
            setNewName('');
            loadStudents();
        } catch (error) {
            alert("Lỗi khi tạo tài khoản");
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert(`Đã sao chép mã: ${text}`);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🛡️</span>
                        <div>
                            <h2 className="text-xl font-bold">Quản trị viên</h2>
                            <p className="text-slate-400 text-sm">Quản lý tài khoản học viên</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-all">✕</button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    
                    {/* Create Form */}
                    <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mb-8">
                        <h3 className="text-indigo-900 font-bold mb-4">Tạo tài khoản mới</h3>
                        <form onSubmit={handleCreate} className="flex gap-4">
                            <input 
                                type="text" 
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Nhập tên học viên (VD: Nguyen Van A)"
                                className="flex-1 px-4 py-3 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button 
                                type="submit"
                                disabled={loading || !newName.trim()}
                                className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
                            >
                                {loading ? 'Đang tạo...' : 'Cấp Mã'}
                            </button>
                        </form>

                        {generatedKey && (
                            <div className="mt-4 bg-white p-4 rounded-xl border border-green-200 flex items-center justify-between animate-in slide-in-from-top-2">
                                <div>
                                    <span className="text-xs font-bold text-green-600 uppercase tracking-wider block mb-1">Tạo thành công! Hãy gửi mã này:</span>
                                    <span className="text-2xl font-mono font-bold text-slate-800">{generatedKey}</span>
                                </div>
                                <button 
                                    onClick={() => copyToClipboard(generatedKey)}
                                    className="px-4 py-2 bg-green-100 text-green-700 font-bold rounded-lg hover:bg-green-200"
                                >
                                    Sao chép
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Student List */}
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        Danh sách học viên <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs">{students.length}</span>
                    </h3>
                    
                    <div className="space-y-3">
                        {students.map(student => (
                            <div key={student.key} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">
                                        {student.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{student.name}</div>
                                        <div className="text-xs text-slate-400">Tạo ngày: {new Date(student.createdAt).toLocaleDateString('vi-VN')}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <code className="bg-slate-100 px-3 py-1 rounded-lg font-mono text-sm border border-slate-200">
                                        {student.key}
                                    </code>
                                    <button 
                                        onClick={() => copyToClipboard(student.key)}
                                        className="text-indigo-600 hover:text-indigo-800 text-sm font-bold"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        ))}
                        {students.length === 0 && (
                            <div className="text-center text-slate-400 py-8">Chưa có học viên nào.</div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};