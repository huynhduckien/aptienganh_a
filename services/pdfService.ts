

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

        // Detect Language roughly to switch cleaning strategy
        const isChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(fullText.substring(0, 1000));

        // Apply cleaning BEFORE sectioning to remove global noise
        const cleanedGlobalText = cleanIrrelevantContent(fullText, isChinese);

        // Filter sections based on user requirements
        // NOTE: Standard academic filtering works mostly for English papers. 
        // For Chinese papers, section headers are often different. 
        // We will try to apply it, but allow fallback.
        let filteredText = isChinese ? cleanedGlobalText : filterAcademicSections(cleanedGlobalText);
        
        // Fallback: If filtering resulted in too little text (e.g. headers not found),
        // revert to the cleaned global text to ensure the user gets something.
        if (filteredText.length < 200 && cleanedGlobalText.length > 200) {
             filteredText = cleanedGlobalText;
        }

        resolve(filteredText);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

// Cleaner for metadata, headers, footers, and noise
const cleanIrrelevantContent = (text: string, isChinese: boolean): string => {
  let cleaned = text;

  if (!isChinese) {
      // --- ENGLISH CLEANING STRATEGY ---
      
      // 1. Remove specifically mentioned ScienceDirect / Journal headers
      cleaned = cleaned.replace(/(?:Contents lists available at|Hosted by)?\s*ScienceDirect/gi, '');
      
      // 2. Remove Journal Info lines
      cleaned = cleaned.replace(/[a-zA-Z\s&]+\d+\s*\(\d{4}\)\s*[\d-]+/g, '');

      // 3. Remove ISSN-like patterns
      cleaned = cleaned.replace(/\b\d{4}-\d{3}[\dX]\b/g, ''); 
      cleaned = cleaned.replace(/\(2022\) 102850/g, ''); 

      // 4. Remove residual author list endings
      cleaned = cleaned.replace(/^\s*.*?\)\.\s*$/gim, '');

      // 5. Remove Standard Headers/Footers
      cleaned = cleaned.replace(/^.*journal homepage:.*$/gim, '');
      cleaned = cleaned.replace(/^.*Research paper.*$/gim, '');
      cleaned = cleaned.replace(/^.*www\.elsevier\.com.*$/gim, '');
      
      // 6. Remove URLs and DOIs
      cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');
      cleaned = cleaned.replace(/doi:?\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi, '');

      // 7. Remove Copyright lines
      cleaned = cleaned.replace(/^.*©\s*\d{4}.*$/gim, '');
      cleaned = cleaned.replace(/^.*all\s+rights\s+reserved.*$/gim, '');
      cleaned = cleaned.replace(/^.*Elsevier B\.V\..*$/gim, '');

      // 8. Remove Email Addresses
      cleaned = cleaned.replace(/[\w\.-]+@[\w\.-]+\.\w+/gi, '');

      // 9. Clean up Keywords
      if (/ARTICLE INFO/i.test(cleaned) && /Keywords:/i.test(cleaned)) {
          cleaned = cleaned.replace(/ARTICLE INFO[\s\S]*?Keywords:/gi, '');
      }
      cleaned = cleaned.replace(/^Keywords:.*$/gim, '');
      cleaned = cleaned.replace(/^.*(?:corresponding|contact)\s+author.*$/gim, '');
  } else {
      // --- CHINESE CLEANING STRATEGY ---
      // Less aggressive on alphanumeric patterns, focus on layout noise
      
      // Remove URLs and Emails
      cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');
      cleaned = cleaned.replace(/[\w\.-]+@[\w\.-]+\.\w+/gi, '');
      
      // Remove common footer noise (Page numbers, excessive dashes)
      cleaned = cleaned.replace(/^\d+$/gm, ''); // Standalone page numbers
  }

  // Common: Collapse excessive newlines/spaces
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
};

// Helper to filter specific academic sections
const filterAcademicSections = (text: string): string => {
  // We want to KEEP: Abstract, Introduction, Methods, Results, Conclusion.
  const sections = [
    // KEEP Sections
    { name: 'Abstract', regex: /(?:^|\n)\s*(?:ABSTRACT|Abstract)\b/, action: 'keep' },
    { name: 'Introduction', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:INTRODUCTION|Introduction)\b/, action: 'keep' },
    { name: 'Methods', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:METHODS|Methodology|Materials and Methods|Experimental)\b/, action: 'keep' },
    { name: 'Results', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:RESULTS|Experimental Results|Findings)\b/, action: 'keep' },
    { name: 'Conclusion', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:CONCLUSION|Conclusions|Concluding Remarks)\b/, action: 'keep' },

    // SKIP Sections
    { name: 'Related Work', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:RELATED WORK|Related Work|Literature Review)\b/, action: 'skip' },
    { name: 'Discussion', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:DISCUSSION|Discussion)\b/, action: 'skip' },
    
    // NOISE Sections (Skip)
    { name: 'Acknowledgments', regex: /(?:^|\n)\s*(?:ACKNOWLEDGMENT|Acknowledgments)\b/i, action: 'skip' },
    { name: 'Declaration', regex: /(?:^|\n)\s*(?:Declaration of Competing Interest|Conflict of Interest)\b/i, action: 'skip' },
    { name: 'Authorship', regex: /(?:^|\n)\s*(?:CRediT authorship contribution statement)\b/i, action: 'skip' },
    { name: 'DataAvailability', regex: /(?:^|\n)\s*(?:Data Availability)\b/i, action: 'skip' },
    { name: 'Appendix', regex: /(?:^|\n)\s*(?:APPENDIX|Appendix)\b/i, action: 'skip' },
    
    // STOP Section
    { name: 'References', regex: /(?:^|\n)\s*(?:REFERENCES|Bibliography)\b/i, action: 'stop' }
  ];

  // Find all matches
  let matches: { index: number, action: string, name: string }[] = [];
  
  sections.forEach(section => {
    const match = text.match(section.regex);
    if (match && match.index !== undefined) {
      matches.push({ index: match.index, action: section.action, name: section.name });
    }
  });

  // Sort by occurrence in text
  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    return text; // Fallback
  }

  let finalContent = "";
  
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    
    if (current.action === 'stop') break;

    if (current.action === 'keep') {
      const nextIndex = (i + 1 < matches.length) ? matches[i+1].index : text.length;
      let content = text.substring(current.index, nextIndex);
      
      // Remove the header itself from the content to clean up
      content = content.replace(current.name === 'Abstract' ? /^\s*(?:ABSTRACT|Abstract)\b/ : /^\s*(?:\d+\.|I\.|)\s*(?:[A-Z][a-zA-Z\s]+)\b/, '');

      content = content.trim();
      if (content.length > 50) { 
          finalContent += content + "\n\n";
      }
    }
  }

  return finalContent.length > 100 ? finalContent : text;
};

export type DifficultyLevel = 'medium' | 'hard';

export const chunkTextByLevel = (text: string, level: DifficultyLevel): string[] => {
  // Check for Chinese characters to determine split strategy
  const isChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text.substring(0, 500));

  let minSentences = 2;
  let maxSentences = 3; 

  if (level === 'medium') {
    minSentences = 2;
    maxSentences = 3;
  } else if (level === 'hard') {
    minSentences = 4;
    maxSentences = 6;
  }

  const cleanText = text
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let rawSentences: string[] = [];

  if (isChinese) {
      // Split by Chinese punctuation: 。 ！ ？
      // Also include standard punctuation just in case
      // Note: Chinese comma '，' is NOT a sentence ender usually.
      const chineseSentenceRegex = /[^。！？.!?]+[。！？.!?]+(\s|$)/g;
      rawSentences = cleanText.match(chineseSentenceRegex) || [cleanText];
  } else {
      // Standard English splitting
      const sentenceRegex = /[^.!?]+[.!?]+(\s|$)/g;
      rawSentences = cleanText.match(sentenceRegex) || [cleanText];
  }

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  
  for (const sentence of rawSentences) {
    // Skip garbage
    if (sentence.trim().length > 1) { // 1 char is enough for Chinese (e.g. "是。")
        currentChunk.push(sentence.trim());
    }

    if (currentChunk.length >= maxSentences) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
    }
  }

  if (currentChunk.length > 0) {
    if (currentChunk.length < minSentences && chunks.length > 0) {
      chunks[chunks.length - 1] += ' ' + currentChunk.join(' ');
    } else {
      chunks.push(currentChunk.join(' '));
    }
  }

  return chunks;
};
