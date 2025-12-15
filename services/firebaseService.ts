import { Flashcard, StudentAccount, ReviewLog, DictionaryResponse, Deck } from "../types";

// URL Firebase chính thức
const FIREBASE_URL = "https://nail-schedule-test-default-rtdb.europe-west1.firebasedatabase.app";

let currentSyncKey: string | null = null;

export const setFirebaseSyncKey = (key: string) => {
    currentSyncKey = key;
};

// --- FLASHCARDS (User Specific) ---

export const fetchCloudFlashcards = async (): Promise<Flashcard[]> => {
  if (!currentSyncKey) return []; // Không có key thì không load
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards.json`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data) return [];

    return Object.values(data);
  } catch (error) {
    console.warn("Cloud flashcards fetch failed", error);
    return [];
  }
};

export const saveCloudFlashcard = async (card: Flashcard): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards/${card.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(card),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud flashcard save failed", error);
  }
};

export const deleteCloudFlashcard = async (cardId: string): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/flashcards/${cardId}.json`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.warn("Cloud flashcard delete failed", error);
  }
};

// --- DECKS (User Specific) ---

export const fetchCloudDecks = async (): Promise<Deck[]> => {
  if (!currentSyncKey) return [];
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/decks.json`);
    if (!response.ok) return [];
    const data = await response.json();
    if (!data) return [];
    return Object.values(data);
  } catch (error) {
    console.warn("Cloud decks fetch failed", error);
    return [];
  }
};

export const saveCloudDeck = async (deck: Deck): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/decks/${deck.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(deck),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud deck save failed", error);
  }
};

export const deleteCloudDeck = async (deckId: string): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/decks/${deckId}.json`, {
      method: 'DELETE'
    });
  } catch (error) {
      console.warn("Cloud deck delete failed", error);
  }
};

// --- REVIEW LOGS (User Specific - NEW for Statistics) ---

export const fetchCloudReviewLogs = async (): Promise<ReviewLog[]> => {
  if (!currentSyncKey) return [];
  try {
    const response = await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/logs.json`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data) return [];

    return Object.values(data);
  } catch (error) {
    console.warn("Cloud logs fetch failed", error);
    return [];
  }
};

export const saveCloudReviewLog = async (log: ReviewLog): Promise<void> => {
  if (!currentSyncKey) return;
  try {
    await fetch(`${FIREBASE_URL}/users/${currentSyncKey}/logs/${log.id}.json`, {
      method: 'PUT',
      body: JSON.stringify(log),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud log save failed", error);
  }
};

// --- DICTIONARY CACHE (Global Shared) ---

export const fetchCloudDictionary = async (): Promise<Record<string, DictionaryResponse>> => {
  try {
    const response = await fetch(`${FIREBASE_URL}/paperlingo/dictionary.json`);
    if (!response.ok) return {};
    
    const data = await response.json();
    return data || {};
  } catch (error) {
    console.warn("Cloud dictionary fetch failed", error);
    return {};
  }
};

export const saveCloudDictionaryItem = async (term: string, data: DictionaryResponse): Promise<void> => {
  try {
    const safeKey = btoa(term.trim().toLowerCase()).replace(/=/g, ''); 
    
    await fetch(`${FIREBASE_URL}/paperlingo/dictionary/${safeKey}.json`, {
      method: 'PUT',
      body: JSON.stringify({ ...data, originalTerm: term }),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.warn("Cloud dictionary item save failed", error);
  }
};

// --- ADMIN MANAGEMENT ---

export const createStudentAccount = async (name: string): Promise<StudentAccount> => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${safeName}-${randomSuffix}`;
    
    const newStudent: StudentAccount = {
        key,
        name,
        createdAt: Date.now()
    };

    try {
        await fetch(`${FIREBASE_URL}/admin/students/${key}.json`, {
            method: 'PUT',
            body: JSON.stringify(newStudent),
            headers: { 'Content-Type': 'application/json' }
        });
        return newStudent;
    } catch (e) {
        throw new Error("Không thể tạo tài khoản học viên");
    }
};

export const getAllStudents = async (): Promise<StudentAccount[]> => {
    try {
        const response = await fetch(`${FIREBASE_URL}/admin/students.json`);
        if (!response.ok) return [];
        const data = await response.json();
        return data ? Object.values(data) : [];
    } catch (e) {
        return [];
    }
};

// Kiểm tra xem key học viên nhập có tồn tại trong hệ thống không
export const verifyStudentKey = async (inputKey: string): Promise<StudentAccount | null> => {
    try {
        const trimmedInput = inputKey.trim();
        const searchLower = trimmedInput.toLowerCase();
        
        console.log("Verifying key:", trimmedInput);

        // BƯỚC 1: Lấy TOÀN BỘ danh sách học viên về để tìm kiếm thông minh
        // (Cách này tránh lỗi case-sensitive của Firebase và cho phép tìm theo Tên)
        const response = await fetch(`${FIREBASE_URL}/admin/students.json`);

        if (response.status === 401 || response.status === 403) {
            alert("LỖI QUYỀN TRUY CẬP: Bạn chưa mở khóa Database (Rules). Hãy vào Firebase Console -> Build -> Realtime Database -> Rules và đổi '.read': true, '.write': true");
            return null;
        }

        let foundAccount: StudentAccount | null = null;
        const allStudentsData = await response.json();

        if (allStudentsData) {
            const students = Object.values(allStudentsData) as StudentAccount[];
            
            // Tìm kiếm ưu tiên: Khớp Key chính xác -> Khớp Key (không phân biệt hoa thường) -> Khớp Tên
            foundAccount = students.find(s => s.key === trimmedInput) // Exact Key
                        || students.find(s => s.key.toLowerCase() === searchLower) // Case-insensitive Key
                        || students.find(s => s.name.toLowerCase() === searchLower) // Match Name
                        || null;
        }

        // BƯỚC 2: Nếu tìm thấy -> Trả về tài khoản đó
        if (foundAccount) {
            console.log("Found account:", foundAccount);
            return foundAccount;
        }

        // BƯỚC 3: Nếu không tìm thấy -> TỰ ĐỘNG TẠO TÀI KHOẢN MỚI
        // Giúp bạn không bao giờ bị kẹt ở màn hình đăng nhập
        console.log("Account not found, auto-creating...");
        
        // Sử dụng chính input của người dùng làm key (nếu nó hợp lệ) hoặc tạo key mới
        const safeKey = trimmedInput.replace(/[^a-zA-Z0-9-_]/g, '');
        const finalKey = safeKey || `user-${Date.now()}`;
        
        const autoAccount: StudentAccount = {
            key: finalKey,
            name: `Học viên ${finalKey}`,
            createdAt: Date.now(),
            lastActive: Date.now()
        };

        await fetch(`${FIREBASE_URL}/admin/students/${finalKey}.json`, {
            method: 'PUT',
            body: JSON.stringify(autoAccount),
            headers: { 'Content-Type': 'application/json' }
        });

        return autoAccount;

    } catch (e) {
        console.error("Login Error:", e);
        // Fallback cuối cùng: Trả về object tạm để bypass lỗi mạng (chỉ dùng cho local dev nếu cần)
        return null; 
    }
};
