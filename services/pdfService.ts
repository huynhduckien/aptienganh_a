
import { structurePaperWithAI } from './geminiService';

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
  let lines = text.split('\n');
  const cleanedLines: string[] = [];

  // 1. LINE-BASED FILTERING (Aggressive)
  const garbageLinePatterns = [
      // Common Journal Noise (User Examples)
      /^Full\s+length\s+article/i,
      /^A\s*R\s*T\s*I\s*C\s*L\s*E\s*I\s*N\s*F\s*O/i, // Spaced out headers (A R T I C L E...)
      /^A\s*B\s*S\s*T\s*R\s*A\s*C\s*T/i,
      /.*(?:\(20\d{2}\)).*\d+/, // Matches "(2025) 111636" or similar page numbering
      /Optics\s+(?:and|&)\s+Laser\s+Technology/i, // Specific example provided
      /Available\s+online/i,
      /Rights\s+reserved/i,
      
      // NEW: Specific Noise Patterns from User Feedback
      /mining,\s*training/i, // "including those mining, training, similar technologies"
      /similar\s+technologies/i,
      /text\s+and\s+data\s+mining/i, 
      /\d{4}-\d{3}[\dX]\/©/i, // ISSN copyright pattern like "0030-3992/©"
      /^These\s+E-?mail\s+address/i, // "These E-mail address:"
      /111636/i, // Specific ID provided by user
      
      // Dates & Submission Info
      /Received\s+\d+/i,
      /Accepted\s+\d+/i,
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
      
      // Misc Noise
      /^Table\s+\d+/i, // Start of table
      /^Fig\.\s+\d+/i, // Start of figure caption
      /^Figure\s+\d+/i,
      /Contents\s+lists\s+available/i,
      /Journal\s+homepage/i,
      /Page\s+\d+\s+of\s+\d+/i, // Page numbers
      /Key\s?words/i,
      
      // Specific Author Formats like "D.-P. Pham and H.-C. Tran"
      /^[A-Z]\.-[A-Z]\.\s+[A-Z][a-z]+/
  ];

  // Regex to PROTECT headers (Intro, Methods, Results, Discussion, Appendix, Glossary)
  // Supports: "1. Introduction", "I. Introduction", "1.0 Introduction", "Introduction", "APPENDIX A"
  const protectedHeaderPattern = /^(?:(?:\d+(?:\.\d*)?|[IVX]+)\.?\s*)?(?:ABSTRACT|INTRODUCTION|BACKGROUND|METHODS|MATERIALS|EXPERIMENTAL|RESULTS|DISCUSSION|CONCLUSIONS?|SUMMARY|REFERENCES|BIBLIOGRAPHY|APPENDIX|SUPPLEMENTARY|GLOSSARY|NOMENCLATURE|ACKNOWLEDGEMENTS?)\b/i;

  for (let line of lines) {
      line = line.trim();
      
      // Skip empty
      if (line.length === 0) continue;

      // Skip very short lines ONLY IF they are not section headers
      if (line.length < 5 && !protectedHeaderPattern.test(line)) continue;
      
      // Filter standalone names/dates often found in headers
      // Example: "D.-P. Pham and H.-C. Tran"
      if (line.length < 50 && /^[A-Z]\.-[A-Z]\./.test(line) && !line.endsWith('.')) continue;

      // Check against garbage patterns
      let isGarbage = false;
      for (const pattern of garbageLinePatterns) {
          if (pattern.test(line)) {
              isGarbage = true;
              break;
          }
      }

      // Check for author lists (heuristic)
      if (!isGarbage && line.length < 200 && line.includes(',')) {
          const authorListScore = (line.match(/[A-Z][a-z]+/g) || []).length; 
          const totalWords = line.split(/\s+/).length;
          if (authorListScore / totalWords > 0.7 && !line.endsWith('.')) {
              isGarbage = true;
          }
      }
      
      // Check for raw data rows (mostly numbers)
      if (!isGarbage && line.length < 100) {
          const digits = (line.match(/\d/g) || []).length;
          const chars = line.length;
          if (digits / chars > 0.5) { // If > 50% is numbers, likely a table row
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

  // 2. INLINE CLEANING (Refined)
  
  // Remove Citations: [1], [1, 2], [1-5], [1, 3-5]
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, '');
  
  // Remove Citations: (Smith, 2020) or (Smith et al., 2020) or (Smith and Jones, 2020)
  cleaned = cleaned.replace(/\([A-Z][a-z]+(?: et al\.| and [A-Z][a-z]+)?,?\s*\d{4}[a-z]?\)/g, '');
  
  // Remove URLs & Emails explicitly
  cleaned = cleaned.replace(/(?:https?|ftp|doi):\/\/[\n\S]+/g, '');
  cleaned = cleaned.replace(/\b[\w\.-]+@[\w\.-]+\.\w{2,4}\b/g, '');
  
  // Normalize newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
};

export type DifficultyLevel = 'medium' | 'hard';

// --- HELPER: SMART LOCAL MERGE (Fallback logic) ---
// Merges short chunks (orphaned headers) into the next chunk
const smartMergeChunks = (chunks: string[]): string[] => {
    const merged: string[] = [];
    let buffer = "";

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i].trim();
        if (!chunk) continue;

        // If buffer has content, append this chunk to it
        if (buffer) {
            buffer += "\n\n" + chunk;
            // If the combined result is long enough, push it
            if (buffer.length > 500) {
                merged.push(buffer);
                buffer = "";
            }
            continue;
        }

        // If current chunk is too short (likely a header or orphaned paragraph)
        // AND there is a next chunk, keep it in buffer
        if (chunk.length < 300 && i < chunks.length - 1) {
            buffer = chunk;
        } else {
            merged.push(chunk);
        }
    }
    
    // Push remaining buffer
    if (buffer) {
        if (merged.length > 0) {
            // If buffer is small leftover, append to last valid chunk
            merged[merged.length - 1] += "\n\n" + buffer;
        } else {
            merged.push(buffer);
        }
    }

    return merged;
};

// --- ENGLISH LOGIC (IMRaD Section based) ---

interface SectionIndices {
    Introduction: number;
    Methods: number;
    Results: number;
    Conclusion: number;
    References: number;
}

const findBestMatchIndex = (text: string, regex: RegExp): number => {
    const match = regex.exec(text);
    return match ? match.index : -1;
};

const extractSections = (text: string): Record<string, string> => {
    // 1. Identify "End of Paper" markers (References, etc.)
    const endSectionRegex = /(?:^|\n)\s*(?:\d+\.?|\[\d+\])?\s*(?:REFERENCES|BIBLIOGRAPHY|LITERATURE\s+CITED|ACKNOWLEDGEMENTS?|FUNDING|DATA\s+AVAILABILITY|DECLARATION\s+OF|AUTHOR\s+CONTRIBUTIONS?|CREDIT\s+AUTHORSHIP)\b/i;
    let endIndex = findBestMatchIndex(text, endSectionRegex);
    
    // 2. Define Regex for IMRaD + Appendix Sections
    // IMPROVED: Added stronger detection for Appendices and Glossaries
    const patterns = {
        Introduction: /(?:^|\n)\s*(?:1\.?|I\.?|1\.0)?\s*(?:INTRODUCTION|BACKGROUND|OBJECTIVES)\b/i,
        Methods: /(?:^|\n)\s*(?:2\.?|II\.?|2\.0)?\s*(?:METHODS|MATERIALS\s+(?:AND|&)\s+METHODS|METHODOLOGY|EXPERIMENTAL|MODEL)\b/i,
        Results: /(?:^|\n)\s*(?:3\.?|III\.?|3\.0)?\s*(?:RESULTS|FINDINGS|DATA\s+ANALYSIS)\b/i,
        Conclusion: /(?:^|\n)\s*(?:4\.?|5\.?|6\.?|IV\.?|V\.?|VI\.?)?\s*(?:DISCUSSION|CONCLUSIONS?|CONCLUDING|SUMMARY)\b/i,
        Appendix: /(?:^|\n)\s*(?:APPENDIX\s*[A-Z]?|SUPPLEMENTARY\s+(?:MATERIAL|DATA|INFO)|GLOSSARY|NOMENCLATURE)\b/i
    };

    // 3. Find Indices
    const indices: { name: string, index: number }[] = [];
    
    Object.entries(patterns).forEach(([name, regex]) => {
        const index = findBestMatchIndex(text, regex);
        if (index !== -1) {
            indices.push({ name, index });
        }
    });

    indices.sort((a, b) => a.index - b.index);

    // 4. Extract Content
    const sections: Record<string, string> = {
        'Introduction': '',
        'Methods': '',
        'Results': '',
        'Conclusion': '',
        'Appendix': ''
    };

    // If no sections found, return entire text as Intro (fallback)
    if (indices.length === 0) {
        sections['Introduction'] = endIndex !== -1 ? text.substring(0, endIndex) : text;
        return sections;
    }

    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        
        const start = current.index;
        
        // If there is a next section, end at its start.
        // If not, end at 'endIndex' (Refs) OR end of text if endIndex is invalid/before start.
        let end = next ? next.index : text.length;
        
        if (!next && endIndex !== -1 && endIndex > start) {
            // Only use endIndex (Refs) if it appears AFTER the current section start
            // AND if the current section is NOT Appendix (Appendix usually comes after refs)
            if (current.name !== 'Appendix') {
                end = endIndex;
            }
        }

        // Specifically for Appendix: It often comes AFTER references. 
        // If this is Appendix, allow reading until the end of file.
        if (current.name === 'Appendix') {
            end = text.length;
        }
        
        let content = text.substring(start, end);
        // Remove the exact header line to avoid duplicate "1. Introduction" if AI regenerates it
        content = content.replace(/^.+$/m, '').trim(); 
        
        if (sections[current.name] !== undefined) {
             sections[current.name] += (sections[current.name] ? '\n\n' : '') + content;
        }
    }

    return sections;
};

// IMPROVED: Helper to split huge text into sentences without breaking abbreviations
// Looks for [.!?] followed by a space and a capital letter.
const splitBySentences = (text: string): string[] => {
    // Insert a unique delimiter at likely sentence boundaries
    // "Fig. 1" -> No split
    // "End. Start" -> Split
    return text.replace(/([.!?])\s+(?=[A-Z])/g, "$1|").split("|");
};

// IMPROVED: Smart Semantic Splitter
// Prioritizes paragraphs, handles huge blocks, and prevents orphan tails.
const smartSplitContent = (content: string, targetLength: number = 1800): string[] => {
    const paragraphs = content.split(/\n\s*\n/);
    const chunks: string[] = [];
    let buffer = "";

    for (let p of paragraphs) {
        p = p.trim();
        if (!p) continue;

        // CASE 1: Paragraph is MASSIVE (e.g. > 1.5x target)
        // Must split internally by sentences
        if (p.length > targetLength * 1.5) {
            // First, flush whatever is in the buffer to a chunk
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
            // Keep the remainder of this huge paragraph in the main buffer
            if (sentBuffer) buffer = sentBuffer; 
            continue;
        }

        // CASE 2: Adding this paragraph exceeds target length
        if (buffer.length + p.length > targetLength) {
            // SOFT LIMIT CHECK: 
            // If overflowing by just a little (e.g., < 20%), let it slide to keep paragraph intact.
            if (buffer.length + p.length < targetLength * 1.2) {
                buffer += "\n\n" + p;
                chunks.push(buffer);
                buffer = "";
            } else {
                // Otherwise, push current buffer and start new with this paragraph
                chunks.push(buffer);
                buffer = p;
            }
        } else {
            // CASE 3: Fits comfortably
            buffer += (buffer ? "\n\n" : "") + p;
        }
    }

    // HANDLE TAIL (The final buffer)
    if (buffer) {
        // Orphan Prevention:
        // If the last chunk is very small (< 400 chars) and we have previous chunks,
        // merge it backwards to the previous chunk, unless that makes the previous chunk absurdly large.
        if (buffer.length < 500 && chunks.length > 0) {
            const lastChunk = chunks[chunks.length - 1];
            // Safety limit: Don't merge if it makes the chunk > 2.5x target
            if (lastChunk.length + buffer.length < targetLength * 2.5) {
                chunks[chunks.length - 1] += "\n\n" + buffer;
            } else {
                chunks.push(buffer);
            }
        } else {
            chunks.push(buffer);
        }
    }

    return chunks;
};

// NOW ASYNC TO SUPPORT AI STRUCTURING
export const chunkTextByLevel = async (text: string, level: DifficultyLevel, language: 'en' | 'zh'): Promise<string[]> => {
  
  // 1. ENGLISH LOGIC (AI Structure + IMRaD Fallback)
  if (language === 'en') {
      
      // OPTION A: AI Structuring (Primary)
      try {
          console.log("Attempting AI Structure analysis...");
          const aiStructuredChunks = await structurePaperWithAI(text);
          if (aiStructuredChunks && aiStructuredChunks.length > 0) {
              return aiStructuredChunks;
          }
      } catch (e) {
          console.warn("AI Structure failed or text too long, falling back to local regex split.", e);
      }

      // OPTION B: Regex Local Split (Fallback)
      const sections = extractSections(text);
      let allChunks: string[] = [];
      const sectionKeys = ['Introduction', 'Methods', 'Results', 'Conclusion', 'Appendix']; 

      for (const sectionName of sectionKeys) {
          const content = sections[sectionName];
          if (!content || content.length < 100) continue;

          // Split logic using NEW Smart Splitter
          // Target ~1800 chars per chunk for meaningful length
          const parts = smartSplitContent(content, 1800);
          
          // Label logic
          const labeledParts = parts.map((p, idx) => {
              // Only add label if it's the very first part of a section
              const label = idx === 0 ? `## ${sectionName.toUpperCase()}\n\n` : "";
              return `${label}${p}`;
          });

          allChunks.push(...labeledParts);
      }

      // If extraction failed completely (no IMRaD headers found)
      if (allChunks.length === 0) {
           allChunks = smartSplitContent(text, 2000);
      }
      
      return allChunks;
  } 
  
  // 2. CHINESE LOGIC
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
          
          // Fix for Last Chunk in Chinese Logic
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
      
      // Chinese Tail Merge Check
      if (chunks.length > 1 && chunks[chunks.length - 1].length < 100) {
          const last = chunks.pop()!;
          chunks[chunks.length - 1] += "\n\n" + last;
      }

      return chunks;
  }
};
