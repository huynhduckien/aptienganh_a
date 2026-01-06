
declare const pdfjsLib: any;

export const extractTextFromPdf = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        
        let fullText = '';
        const totalPages = pdf.numPages;

        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join('\n');
          fullText += pageText + '\n\n'; 
        }

        resolve(cleanIrrelevantContent(fullText));
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

const cleanIrrelevantContent = (text: string): string => {
  let lines = text.split('\n');
  const cleanedLines: string[] = [];

  const garbageLinePatterns = [
      /^Full\s+length\s+article/i,
      /^A\s*R\s*T\s*I\s*C\s*L\s*E\s*I\s*N\s*F\s*O/i,
      /^A\s*B\s*S\s*T\s*R\s*A\s*C\s*T/i,
      /.*(?:\(20\d{2}\)).*\d+/,
      /Optics\s+(?:and|&)\s+Laser\s+Technology/i,
      /Available\s+online/i,
      /Rights\s+reserved/i,
      /mining,\s*training/i,
      /similar\s+technologies/i,
      /text\s+and\s+data\s+mining/i, 
      /\d{4}-\d{3}[\dX]\/©/i,
      /^These\s+E-?mail\s+address/i,
      /©\s*\d{4}/,
      /Elsevier/i,
      /ScienceDirect/i,
      /doi\.org/i,
      /Page\s+\d+\s+of\s+\d+/i
  ];

  for (let line of lines) {
      line = line.trim();
      if (line.length === 0) continue;
      
      let isGarbage = false;
      for (const pattern of garbageLinePatterns) {
          if (pattern.test(line)) {
              isGarbage = true;
              break;
          }
      }

      if (!isGarbage) {
          cleanedLines.push(line);
      }
  }

  let cleaned = cleanedLines.join('\n');
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, '');
  cleaned = cleaned.replace(/\([A-Z][a-z]+(?: et al\.| and [A-Z][a-z]+)?,?\s*\d{4}[a-z]?\)/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
};

export type DifficultyLevel = 'medium' | 'hard';

const splitBySentences = (text: string): string[] => {
    return text.replace(/([.!?])\s+(?=[A-Z])/g, "$1|").split("|");
};

const smartSplitContent = (content: string, targetLength: number = 1800): string[] => {
    const paragraphs = content.split(/\n\s*\n/);
    const chunks: string[] = [];
    let buffer = "";

    for (let p of paragraphs) {
        p = p.trim();
        if (!p) continue;

        if (p.length > targetLength * 1.5) {
            if (buffer) { chunks.push(buffer); buffer = ""; }
            const sentences = splitBySentences(p);
            let sentBuffer = "";
            for (const s of sentences) {
                if (sentBuffer.length + s.length > targetLength) {
                    chunks.push(sentBuffer);
                    sentBuffer = s;
                } else {
                    sentBuffer += (sentBuffer ? " " : "") + s;
                }
            }
            if (sentBuffer) buffer = sentBuffer; 
            continue;
        }

        if (buffer.length + p.length > targetLength) {
            chunks.push(buffer);
            buffer = p;
        } else {
            buffer += (buffer ? "\n\n" : "") + p;
        }
    }

    if (buffer) chunks.push(buffer);
    return chunks;
};

export const chunkTextByLevel = async (text: string, level: DifficultyLevel, language: 'en' | 'zh'): Promise<string[]> => {
    // Không dùng AI nữa, chỉ sử dụng thuật toán chia đoạn văn bản
    return smartSplitContent(text, level === 'hard' ? 2500 : 1200);
};
