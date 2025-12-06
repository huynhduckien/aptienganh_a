
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

  // 1. Remove specific Journal Metadata Lines (Received, Accepted, etc.)
  // Matches: "Received 3 November 2023", "Available online...", "© 2024 Elsevier Ltd."
  cleaned = cleaned.replace(/(?:Received|Accepted|Revised|Available online).*?\d{4}/gi, '');
  cleaned = cleaned.replace(/©\s*\d{4}.*?(?:Elsevier|Springer|IEEE|Ltd|Inc)\.?/gi, '');
  cleaned = cleaned.replace(/Copyright\s*©\s*\d{4}.*/gi, '');

  // 2. Remove Author Info & Correspondence
  // Matches: "* Corresponding author.", "E-mail address: ..."
  cleaned = cleaned.replace(/^\*?\s*Corresponding author.*/gim, '');
  cleaned = cleaned.replace(/(?:E-mail|Email)\s*address:?.*/gi, '');
  
  // 3. Remove CRediT Author Statement (Roles)
  // Matches: "Name: Writing – review & editing, Methodology..."
  cleaned = cleaned.replace(/^.*(?::|–)\s*(?:Writing|Supervision|Methodology|Investigation|Formal analysis|Conceptualization|Funding acquisition|Project administration).*$/gim, '');

  // 4. Remove Header/Footer Artifacts
  cleaned = cleaned.replace(/(?:Contents lists available at|Hosted by)?\s*ScienceDirect/gi, '');
  cleaned = cleaned.replace(/[a-zA-Z\s&]+\d+\s*\(\d{4}\)\s*[\d-]+/g, ''); // Journal Volume/Issue
  cleaned = cleaned.replace(/\b\d{4}-\d{3}[\dX]\b/g, ''); // ISSN
  cleaned = cleaned.replace(/^\s*.*?\)\.\s*$/gim, ''); // Artifacts ending in ).
  cleaned = cleaned.replace(/^.*journal homepage:.*$/gim, '');
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, ''); // URLs
  cleaned = cleaned.replace(/doi:?\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi, ''); // DOIs
  cleaned = cleaned.replace(/[\w\.-]+@[\w\.-]+\.\w+/gi, ''); // Emails
  
  // 5. Remove Figure/Table Captions (Optional, but usually distracts from reading)
  // cleaned = cleaned.replace(/^(?:Fig\.|Figure|Table)\s*\d+\.?.*$/gim, '');

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Normalize spacing

  return cleaned;
};

// Helper to filter specific academic sections
const filterAcademicSections = (text: string): string => {
  const sections = [
    { name: 'Abstract', regex: /(?:^|\n)\s*(?:ABSTRACT|Abstract)\b/, action: 'keep' },
    { name: 'Introduction', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:INTRODUCTION|Introduction)\b/, action: 'keep' },
    // Methods & Results are implicitly kept if we don't stop before them
    { name: 'Conclusion', regex: /(?:^|\n)\s*(?:\d+\.|I\.|)\s*(?:CONCLUSION|Conclusions)\b/, action: 'keep' },
    
    // SECTIONS TO REMOVE (STOP READING)
    { name: 'References', regex: /(?:^|\n)\s*(?:REFERENCES|Bibliography)\b/i, action: 'stop' },
    { name: 'Acknowledgements', regex: /(?:^|\n)\s*(?:ACKNOWLEDGEMENTS|Acknowledgements)\b/i, action: 'stop' },
    { name: 'Declaration', regex: /(?:^|\n)\s*(?:Declaration of|Competing interest|Conflict of interest)\b/i, action: 'stop' },
    { name: 'Data Availability', regex: /(?:^|\n)\s*(?:Data availability|Data sharing)\b/i, action: 'stop' },
    { name: 'Author Contributions', regex: /(?:^|\n)\s*(?:Author contributions|CRediT authorship)\b/i, action: 'stop' },
    { name: 'Appendix', regex: /(?:^|\n)\s*(?:APPENDIX|Appendix)\b/i, action: 'stop' }
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
  
  // If Abstract isn't the first detected section, keep the text before it (often Title/Authors) 
  // ONLY if it's not super long garbage. For now, let's assume we start from the first detected 'keep' section.
  
  let processing = false;

  // Case: No explicit start section found, assume start at 0? 
  // Better: If Abstract is found, start there.
  
  const firstKeep = matches.find(m => m.action === 'keep');
  if (firstKeep && firstKeep.index > 0) {
      // Option: Include title text before abstract? 
      // For language learning, Title is good. Let's keep from 0 if Abstract is the first match.
      if (matches[0].name === 'Abstract') {
          // Keep title area, but clean it heavily
          let titleArea = text.substring(0, matches[0].index);
          // Remove author names/affiliations usually found here if possible, or let AI clean it
          finalContent += titleArea + "\n";
      }
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    
    if (current.action === 'stop') {
        // We stop everything here.
        break;
    }

    if (current.action === 'keep') {
      const nextIndex = (i + 1 < matches.length) ? matches[i+1].index : text.length;
      let content = text.substring(current.index, nextIndex);
      
      // Remove the section header itself to make reading flow better? Or keep it?
      // Let's keep it but formatted.
      
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
      // Fallback: If filtering removed too much, revert to cleaned text
      const workingText = filtered.length > 300 ? filtered : text;

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
