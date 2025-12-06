
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
          
          // Join items with newline to preserve structure
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join('\n');
          
          fullText += pageText + '\n\n'; 
        }

        // Apply cleaning
        let cleanedText = cleanIrrelevantContent(fullText);
        
        // NEW: Aggressive Section Slicing (Keep only Intro -> Conclusion)
        cleanedText = keepOnlyMainSections(cleanedText);

        resolve(cleanedText);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

// NEW: Aggressive Slicer to cut off Title/Abstract/Authors
const keepOnlyMainSections = (text: string): string => {
    // 1. Identify start of Introduction
    // Matches: "1. Introduction", "I. INTRODUCTION", "Introduction" (case insensitive) at start of line
    const introRegex = /(?:^|\n)\s*(?:1\.?|I\.?)?\s*(?:INTRODUCTION|Introduction)\b/g;
    let match = introRegex.exec(text);
    
    // If we find "Introduction", discard everything before it (Title, Abstract, Authors)
    let startIndex = 0;
    if (match) {
        startIndex = match.index;
    }

    // 2. Identify start of References (to cut off the end)
    const refRegex = /(?:^|\n)\s*(?:REFERENCES|Bibliography|Literature Cited)\b/i;
    let endMatch = text.match(refRegex);
    let endIndex = text.length;
    if (endMatch && endMatch.index) {
        endIndex = endMatch.index;
    }

    // Slice the text
    let coreContent = text.substring(startIndex, endIndex);

    // Safety check: If slicing removed too much (e.g. false positive), revert to full cleaned text
    // Assuming a paper body should be at least 20% of the text or 1000 chars
    if (coreContent.length < 500) {
        return text.substring(0, endIndex); // Just cut references
    }

    return coreContent;
};

// Cleaner for metadata, headers, footers, and noise
const cleanIrrelevantContent = (text: string): string => {
  let lines = text.split('\n');
  const cleanedLines: string[] = [];

  // 1. LINE-BASED FILTERING (Aggressive)
  const garbageLinePatterns = [
      // Dates & Submission Info
      /Received\s+\d+/i,
      /Accepted\s+\d+/i,
      /Available\s+online/i,
      /Revised\s+form/i,
      /Published\s+online/i,
      /Article\s+history/i,
      
      // Copyright & Journals & Publishers
      /©\s*\d{4}/,
      /Copyright/i,
      /All\s+rights\s+reserved/i,
      /Elsevier/i,
      /ScienceDirect/i,
      /Springer/i,
      /IEEE/i,
      /MDPI/i,
      /Wiley/i,
      /Taylor\s*&\s*Francis/i,
      /Nature\s+Publishing/i,
      /Volume\s+\d+/i,
      /Issue\s+\d+/i,
      /ISSN/i,
      /https?:\/\//i,
      /doi\.org/i,
      /www\./i,
      /http:/i,
      
      // Author Info & Correspondence
      /Corresponding\s+author/i,
      /E-?mail\s*:/i,
      /Department\s+of/i,
      /University/i,
      /Institute/i,
      /School\s+of/i,
      /Tel\.:/i,
      /Fax:/i,
      /Ph\.\s?D\./i,
      /M\.\s?Sc\./i,
      
      // CRediT Authorship & Declarations
      /Writing\s?[–-]\s?review/i,
      /Conceptualization/i,
      /Formal\s+analysis/i,
      /Funding\s+acquisition/i,
      /Declaration\s+of\s+competing\s+interest/i,
      /conflict\s+of\s+interest/i,
      /Data\s+availability/i,
      /Acknowledgements/i,
      /APPENDIX/i,
      /Author\s+contributions/i,
      /Credit\s+authorship/i,
      
      // Misc Noise
      /^Table\s+\d+/i, // Start of table
      /^Fig\.\s+\d+/i, // Start of figure caption
      /^Figure\s+\d+/i,
      /Contents\s+lists\s+available/i,
      /Journal\s+homepage/i,
      /Page\s+\d+\s+of\s+\d+/i, // Page numbers
      /ABSTRACT/i, // We want to remove Abstract based on user request
      /Key\s?words/i
  ];

  for (let line of lines) {
      line = line.trim();
      
      // Skip empty or very short lines (often page numbers or artifacts)
      if (line.length < 4) continue;

      // Check against garbage patterns
      let isGarbage = false;
      for (const pattern of garbageLinePatterns) {
          if (pattern.test(line)) {
              isGarbage = true;
              break;
          }
      }

      // Check for author lists (usually list of names with superscripts like 'a, b' or just names)
      if (!isGarbage && line.length < 200 && line.includes(',')) {
          const authorListScore = (line.match(/[A-Z][a-z]+/g) || []).length; 
          const totalWords = line.split(/\s+/).length;
          // If > 70% of words are capitalized and it doesn't end in '.', likely author list
          if (authorListScore / totalWords > 0.7 && !line.endsWith('.')) {
              isGarbage = true;
          }
      }

      // If not garbage, keep it
      if (!isGarbage) {
          cleanedLines.push(line);
      }
  }

  // Join back
  let cleaned = cleanedLines.join('\n');

  // 2. INLINE CLEANING (Remove noise INSIDE sentences)
  
  // Remove Citations: [1], [1, 2], [1-3]
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, '');
  
  // Remove Citations: (Smith, 2020) or (Smith et al., 2020)
  cleaned = cleaned.replace(/\([A-Za-z\s\.,&]+,\s*\d{4}[a-z]?\)/g, '');

  // Remove URLs and Emails within text
  cleaned = cleaned.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
  cleaned = cleaned.replace(/\b[\w\.-]+@[\w\.-]+\.\w{2,4}\b/g, '');

  // Normalize multiple newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
};

export type DifficultyLevel = 'medium' | 'hard';

export const chunkTextByLevel = (text: string, level: DifficultyLevel, language: 'en' | 'zh'): string[] => {
  
  // 1. ENGLISH LOGIC (Sentence based)
  if (language === 'en') {
      let minSentences = 2;
      let maxSentences = 3; 

      if (level === 'hard') {
        minSentences = 4;
        maxSentences = 6;
      }

      // Remove extra newlines for chunking
      const cleanText = text.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Robust sentence splitting
      const sentenceRegex = /[^.!?]+[.!?]+(\s|$)/g;
      const rawSentences = cleanText.match(sentenceRegex) || [cleanText];

      const chunks: string[] = [];
      let currentChunk: string[] = [];
      
      for (const sentence of rawSentences) {
        // Filter out garbage sentences that might have survived
        if (sentence.length < 15 || /^\d+$/.test(sentence.trim()) || /Page\s+\d+/i.test(sentence)) continue;

        currentChunk.push(sentence.trim());

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
      const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
      
      let partsCount = 0;
      if (level === 'medium') { 
          partsCount = Math.floor(Math.random() * (8 - 5 + 1)) + 5; 
      } else { 
          partsCount = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
      }

      if (cleanText.length < 200) return [cleanText];

      const targetChunkSize = Math.ceil(cleanText.length / partsCount);
      const chunks: string[] = [];
      let startIndex = 0;

      for (let i = 0; i < partsCount; i++) {
          if (startIndex >= cleanText.length) break;

          let endIndex = startIndex + targetChunkSize;
          
          if (i === partsCount - 1) {
              endIndex = cleanText.length;
          } else {
              const searchWindow = 100;
              const slice = cleanText.substring(Math.max(0, endIndex - searchWindow), Math.min(cleanText.length, endIndex + searchWindow));
              
              const puncRegex = /[。！？\n]/g;
              let match;
              let bestSplitOffset = -1;

              while ((match = puncRegex.exec(slice)) !== null) {
                  bestSplitOffset = match.index;
              }

              if (bestSplitOffset !== -1) {
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
