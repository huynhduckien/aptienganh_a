
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
          
          // Join items with newline to preserve structure for header detection
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join('\n');
          
          fullText += pageText + '\n\n'; 
        }

        // Apply cleaning (Generic)
        let cleanedText = cleanIrrelevantContent(fullText);
        
        resolve(cleanedText);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

// Cleaner for metadata, headers, footers, and noise
const cleanIrrelevantContent = (text: string): string => {
  let cleaned = text;

  // Generic Cleaning
  cleaned = cleaned.replace(/(?:Contents lists available at|Hosted by)?\s*ScienceDirect/gi, '');
  cleaned = cleaned.replace(/[a-zA-Z\s&]+\d+\s*\(\d{4}\)\s*[\d-]+/g, '');
  cleaned = cleaned.replace(/\b\d{4}-\d{3}[\dX]\b/g, ''); // ISSN
  cleaned = cleaned.replace(/^\s*.*?\)\.\s*$/gim, '');
  cleaned = cleaned.replace(/^.*journal homepage:.*$/gim, '');
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');
  cleaned = cleaned.replace(/doi:?\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi, '');
  cleaned = cleaned.replace(/[\w\.-]+@[\w\.-]+\.\w+/gi, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
};

// Helper to filter specific academic sections
// NOTE: This logic is heavily biased towards English headers. 
// For Chinese, we might skip strict section filtering to avoid losing content if headers don't match.
const filterAcademicSections = (text: string): string => {
  const sections = [
    { name: 'Abstract', regex: /(?:^|\n)\s*(?:ABSTRACT|Abstract)\b/, action: 'keep' },
    { name: 'Introduction', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:INTRODUCTION|Introduction)\b/, action: 'keep' },
    { name: 'Conclusion', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:CONCLUSION|Conclusions)\b/, action: 'keep' },
    { name: 'References', regex: /(?:^|\n)\s*(?:REFERENCES|Bibliography)\b/i, action: 'stop' }
  ];

  let matches: { index: number, action: string, name: string }[] = [];
  sections.forEach(section => {
    const match = text.match(section.regex);
    if (match && match.index !== undefined) {
      matches.push({ index: match.index, action: section.action, name: section.name });
    }
  });

  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) return text;

  let finalContent = "";
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    if (current.action === 'stop') break;
    if (current.action === 'keep') {
      const nextIndex = (i + 1 < matches.length) ? matches[i+1].index : text.length;
      let content = text.substring(current.index, nextIndex);
      content = content.replace(current.name === 'Abstract' ? /^\s*(?:ABSTRACT|Abstract)\b/ : /^\s*(?:\d+\.|I\.|)\s*(?:[A-Z][a-zA-Z\s]+)\b/, '');
      finalContent += content.trim() + "\n\n";
    }
  }
  return finalContent.length > 100 ? finalContent : text;
};

export type DifficultyLevel = 'medium' | 'hard';

export const chunkTextByLevel = (text: string, level: DifficultyLevel, language: 'en' | 'zh'): string[] => {
  
  // 1. ENGLISH LOGIC (Sentence based)
  if (language === 'en') {
      // First, try to filter academic sections if it looks like an English paper
      const filtered = filterAcademicSections(text);
      const workingText = filtered.length > 500 ? filtered : text;

      let minSentences = 2;
      let maxSentences = 3; 

      if (level === 'hard') {
        minSentences = 4;
        maxSentences = 6;
      }

      const cleanText = workingText.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const sentenceRegex = /[^.!?]+[.!?]+(\s|$)/g;
      const rawSentences = cleanText.match(sentenceRegex) || [cleanText];

      const chunks: string[] = [];
      let currentChunk: string[] = [];
      
      for (const sentence of rawSentences) {
        if (sentence.trim().length > 3) currentChunk.push(sentence.trim());

        if (currentChunk.length >= maxSentences) {
          chunks.push(currentChunk.join(' '));
          currentChunk = [];
        }
      }
      if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
      
      return chunks;
  } 
  
  // 2. CHINESE LOGIC (Part based)
  else {
      // Clean up extra spaces which are rare in Chinese, but normalize newlines
      const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
      
      // Determine number of parts
      // Easy: 5-8 parts -> Random between 5 and 8
      // Hard: 2-4 parts -> Random between 2 and 4
      let partsCount = 0;
      if (level === 'medium') { // Easy in UI
          partsCount = Math.floor(Math.random() * (8 - 5 + 1)) + 5; 
      } else { // Hard in UI
          partsCount = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
      }

      // If text is too short, just return 1 chunk
      if (cleanText.length < 200) return [cleanText];

      const targetChunkSize = Math.ceil(cleanText.length / partsCount);
      const chunks: string[] = [];
      let startIndex = 0;

      for (let i = 0; i < partsCount; i++) {
          if (startIndex >= cleanText.length) break;

          // Ideal end index
          let endIndex = startIndex + targetChunkSize;
          
          if (i === partsCount - 1) {
              // Last chunk takes the rest
              endIndex = cleanText.length;
          } else {
              // Look for the nearest punctuation to split cleanly
              // Punctuation: 。 ！ ？ \n
              const searchWindow = 100; // Look ahead/behind 100 chars
              const slice = cleanText.substring(Math.max(0, endIndex - searchWindow), Math.min(cleanText.length, endIndex + searchWindow));
              
              // Find last punctuation in this window to split AFTER it
              // Regex matches Chinese full stop, exclamation, question mark
              const puncRegex = /[。！？\n]/g;
              let match;
              let bestSplitOffset = -1;

              while ((match = puncRegex.exec(slice)) !== null) {
                  // We want the split point closest to the middle of the window (which aligns with targetChunkSize)
                  // But safely, let's just take the last one found in the window to fill the chunk as much as possible
                  bestSplitOffset = match.index;
              }

              if (bestSplitOffset !== -1) {
                  // Absolute index in cleanText
                  endIndex = Math.max(0, endIndex - searchWindow) + bestSplitOffset + 1;
              }
          }

          const chunk = cleanText.substring(startIndex, endIndex).trim();
          if (chunk.length > 0) {
              chunks.push(chunk);
          }
          startIndex = endIndex;
      }

      return chunks;
  }
};