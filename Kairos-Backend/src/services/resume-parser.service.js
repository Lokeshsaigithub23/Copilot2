const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { createWorker } = require('tesseract.js');

const TECH_TAXONOMY = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', '.NET', 'Go', 'Golang',
  'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Dart', 'R', 'SQL', 'PL/SQL', 'MATLAB',
  'HTML', 'HTML5', 'CSS', 'CSS3', 'Sass', 'SCSS', 'Bootstrap', 'Tailwind CSS', 'Tailwind',
  'React', 'React.js', 'Next.js', 'Vue', 'Vue.js', 'Angular', 'AngularJS', 'Svelte', 'Redux',
  'Node.js', 'Express', 'Express.js', 'NestJS', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Spring',
  'Hibernate', 'JDBC', 'JPA', 'MERN Stack', 'MEAN Stack',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'DynamoDB', 'SQLite', 'Oracle DB', 'Prisma',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Google Cloud', 'Azure', 'Terraform', 'CI/CD', 'Git', 'GitHub', 'GitLab',
  'Jenkins', 'Linux', 'Unix', 'Bash', 'Shell Scripting',
  'Kafka', 'RabbitMQ', 'GraphQL', 'REST APIs', 'RESTful APIs', 'Microservices', 'System Design',
  'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'Keras', 'Scikit-learn', 'Pandas', 'NumPy',
  'LLM', 'LLMs', 'Gen-AI', 'Generative AI', 'NLP', 'Computer Vision', 'OpenCV',
  'Power BI', 'Tableau', 'Excel',
  'OOP', 'Object-Oriented Programming', 'Data Structures', 'Algorithms', 'JSON', 'XML',
  'Agile', 'Scrum', 'Jira', 'Unit Testing', 'Jest', 'Cypress', 'Mocha', 'Selenium', 'Postman',
  'Problem Solving', 'Analytical Thinking', 'Communication', 'Teamwork'
];
const COMMON_SKILLS = TECH_TAXONOMY;

async function extractTextFromScannedPdf(dataBuffer, maxPages = Infinity) {
  const parser = new pdfParse.PDFParse({ data: dataBuffer });
  const screenshots = await parser.getScreenshot({ scale: 1.5 });
  await parser.destroy();

  const worker = await createWorker('eng');
  try {
    const pageTexts = [];
    for (const page of (screenshots.pages || []).slice(0, maxPages)) {
      const result = await worker.recognize(Buffer.from(page.data));
      pageTexts.push(result.data.text || '');
    }
    return pageTexts.join('\n\n');
  } finally {
    await worker.terminate();
  }
}

function joinLineItems(lineItems) {
  if (!lineItems || lineItems.length === 0) return '';
  let lineStr = lineItems[0].str;
  let lastRight = lineItems[0].x + (lineItems[0].width || 0);
  let lastHeight = lineItems[0].height || 10;

  for (let idx = 1; idx < lineItems.length; idx++) {
    const cur = lineItems[idx];
    const gap = cur.x - lastRight;
    const curHeight = cur.height || 10;
    // Scale the space threshold to the font size in play. A fixed
    // absolute threshold works for normal body text but is far too
    // small for larger headings/names, causing a space to be
    // inserted between every letter (e.g. "G R A N D H I").
    const spaceThreshold = Math.max(1.8, Math.max(lastHeight, curHeight) * 0.16);
    const noSpaceBefore = /^[,.:;!?\)\-\/]/.test(cur.str);
    const noSpaceAfter = /[\(\-\/]$/.test(lineStr);
    if (gap > spaceThreshold && !lineStr.endsWith(' ') && !cur.str.startsWith(' ') && !noSpaceBefore && !noSpaceAfter) {
      lineStr += ' ';
    }
    lineStr += cur.str;
    lastRight = Math.max(lastRight, cur.x + (cur.width || 0));
    lastHeight = curHeight;
  }
  return lineStr.trim();
}

/**
 * Sorts a set of PDF text items (top-to-bottom, left-to-right) and joins
 * them into logical lines, adapting row/space thresholds to font size.
 */
function buildLinesFromItems(items) {
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    return a.x - b.x;
  });

  let currentY = null;
  const lines = [];
  let currentLine = [];

  for (const item of sorted) {
    // Scale the row-grouping tolerance to font size too, so a single
    // large heading line isn't split across multiple detected rows.
    const yThreshold = Math.max(4, (item.height || 10) * 0.4);
    if (currentY === null || Math.abs(currentY - item.y) > yThreshold) {
      if (currentLine.length > 0) {
        lines.push(joinLineItems(currentLine));
      }
      currentLine = [item];
      currentY = item.y;
    } else {
      currentLine.push(item);
    }
  }
  if (currentLine.length > 0) {
    lines.push(joinLineItems(currentLine));
  }
  return lines.filter(Boolean);
}

/**
 * Detects a stable vertical gutter separating a two-column layout (e.g. a
 * sidebar resume). Returns the split X coordinate, or null if the page
 * appears to be single-column.
 */
function detectColumnSplit(items) {
  if (!items || items.length < 6) return null;

  const minX = Math.min(...items.map(i => i.x));
  const maxX = Math.max(...items.map(i => i.x + (i.width || 0)));
  const pageWidth = maxX - minX;
  if (pageWidth < 100) return null;

  // Group items into rows using the same y-clustering as buildLinesFromItems,
  // then look at each row's horizontal span rather than raw word gaps -
  // word gaps within a column's own text otherwise look like false gutters.
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    return a.x - b.x;
  });
  const rows = [];
  let currentY = null;
  let currentRow = [];
  for (const item of sorted) {
    const yThreshold = Math.max(4, (item.height || 10) * 0.4);
    if (currentY === null || Math.abs(currentY - item.y) > yThreshold) {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    } else {
      currentRow.push(item);
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  if (rows.length < 4) return null;

  const rowSpans = rows.map(row => ({
    minX: Math.min(...row.map(i => i.x)),
    maxX: Math.max(...row.map(i => i.x + (i.width || 0)))
  }));

  // Scan candidate gutters across the central band and pick the one where
  // the most rows sit entirely to one side (a real two-column layout).
  const bandStart = minX + pageWidth * 0.2;
  const bandEnd = minX + pageWidth * 0.8;
  const step = Math.max(4, pageWidth * 0.01);

  let best = null;
  for (let x = bandStart; x <= bandEnd; x += step) {
    let leftRows = 0;
    let rightRows = 0;
    let straddling = 0;
    for (const span of rowSpans) {
      if (span.maxX <= x) leftRows++;
      else if (span.minX >= x) rightRows++;
      else straddling++;
    }
    const compatRatio = (leftRows + rightRows) / rowSpans.length;
    if (leftRows >= 2 && rightRows >= 2 && compatRatio >= 0.6) {
      if (!best || compatRatio > best.compatRatio || (compatRatio === best.compatRatio && straddling < best.straddling)) {
        best = { x, compatRatio, straddling };
      }
    }
  }

  return best ? best.x : null;
}

/**
 * Extracts raw text from PDF, DOCX, or DOC file.
 */
async function extractTextFromFile(filePath, originalName = '') {
  const ext = (path.extname(originalName || filePath) || '').toLowerCase();

  let text = '';
  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    if (pdfParse && pdfParse.PDFParse) {
      try {
        const parser = new pdfParse.PDFParse({ data: dataBuffer });
        const doc = await parser.load();
        const numPages = doc.numPages;
        const pageTexts = [];

        for (let p = 1; p <= numPages; p++) {
          const page = await doc.getPage(p);
          const content = await page.getTextContent();

          const items = (content.items || [])
            .filter(it => it && it.str && it.str.trim())
            .map(it => ({
              str: it.str,
              x: it.transform[4],
              y: it.transform[5],
              width: it.width || 0,
              height: it.height || 10
            }));

          // Sidebar-style resumes (contact/skills column + main content
          // column) must be read column-by-column, not merged by row,
          // otherwise unrelated text from each column gets interleaved.
          const columnSplit = detectColumnSplit(items);
          const lines = columnSplit !== null
            ? [
                ...buildLinesFromItems(items.filter(i => i.x < columnSplit)),
                ...buildLinesFromItems(items.filter(i => i.x >= columnSplit))
              ]
            : buildLinesFromItems(items);

          pageTexts.push(lines.filter(Boolean).join('\n'));
        }
        text = pageTexts.join('\n\n');
      } catch (err) {
        console.warn('[ResumeParser] Spatial extraction failed, falling back to default getText:', err.message);
        const parser = new pdfParse.PDFParse({ data: dataBuffer });
        const parsed = await parser.getText();
        text = parsed.text || '';
      }
    } else if (typeof pdfParse === 'function') {
      const parsed = await pdfParse(dataBuffer);
      text = parsed.text || '';
    } else {
      throw new Error('PDF parsing library could not be initialized.');
    }
  } else if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value || '';
  } else if (ext === '.doc') {
    // Legacy .doc format
    if (process.platform === 'darwin') {
      try {
        const stdout = execFileSync('textutil', ['-convert', 'txt', '-stdout', filePath], {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024
        });
        if (stdout && stdout.trim().length > 20) {
          text = stdout;
        }
      } catch (e) {
        console.warn('[ResumeParser] textutil extraction failed, falling back:', e.message);
      }
    }

    if (!text) {
      // Fallback: extract printable strings
      const buf = fs.readFileSync(filePath);
      const latin = buf.toString('latin1').replace(/[^\x20-\x7E\r\n\t]/g, ' ');
      text = latin.split(/\s{2,}/).filter(chunk => chunk.length > 2).join(' ');
    }
  } else {
    throw new Error(`Unsupported file type: ${ext}. Supported formats are .pdf, .docx, and .doc.`);
  }

  // Mac-authored resumes (Pages, TextEdit, legacy .doc converters) often use
  // a bare \r line break, which collapses every line into one blob if left
  // unnormalized.
  let cleanedText = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();

  // Some resumes are scanned images with no PDF text layer. OCR only when
  // normal extraction produced no usable text, keeping text PDFs fast.
  if (ext === '.pdf' && cleanedText.length < 50) {
    try {
      const pdfBuffer = fs.readFileSync(filePath);
      const previewText = (await extractTextFromScannedPdf(pdfBuffer, 2))
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
      const hasResumePreviewSignal = /[\w.-]+@[\w.-]+\.[a-z]{2,}|linkedin\.com|github\.com|(?:resume|curriculum\s+vitae|professional\s+summary|work\s+experience|education|technical\s+skills|projects|certifications?)/i.test(previewText);
      if (!hasResumePreviewSignal) {
        throw new Error('The uploaded document does not appear to be a resume. Please upload a valid resume.');
      }
      const ocrText = await extractTextFromScannedPdf(pdfBuffer);
      cleanedText = ocrText.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
    } catch (err) {
      if (/does not appear to be a resume/i.test(err.message)) throw err;
      console.warn('[ResumeParser] OCR extraction failed:', err.message);
    }
  }

  if (!cleanedText || cleanedText.length < 50) {
    throw new Error('The uploaded document does not appear to be a resume. Please upload a valid resume.');
  }

  return cleanedText;
}

const RESUME_SECTIONS = [
  {
    name: 'Professional Summary',
    regex: /(?:^|\n|[\r\n\t•\-\*#|0-9.]\s*)(?:professional\s+summary|executive\s+summary|career\s+summary|summary\s+of\s+qualifications|professional\s+profile|career\s+objective|summary|objective|about\s+me|personal\s+statement|profile)\b/i
  },
  {
    name: 'Education',
    regex: /(?:^|\n|[\r\n\t•\-\*#|0-9.]\s*)(?:education|educational\s+background|academic\s+background|academics|academic\s+history|educational\s+qualifications?|qualifications|bachelor(?:'s)?|master(?:'s)?|b\.?tech|m\.?tech|b\.?s\.?|m\.?s\.?|b\.?e\.?|ph\.?d|degree|university|college|gpa|cgpa)\b/i
  },
  {
    name: 'Skills',
    regex: /(?:^|\n|[\r\n\t•\-\*#|0-9.]\s*)(?:technical\s+skills?|core\s+competencies|key\s+skills?|skills?\s*(?:&|and)\s*(?:tools?|technologies)|technologies|tech\s+stack|programming\s+languages|skills|proficiencies|areas\s+of\s+expertise|tools\s*(?:&|and)\s*frameworks)\b/i
  },
  {
    name: 'Experience',
    regex: /(?:^|\n|[\r\n\t•\-\*#|0-9.]\s*)(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|career\s+history|experience|internships?|employment|relevant\s+experience)\b/i
  },
  {
    name: 'Projects',
    regex: /(?:^|\n|[\r\n\t•\-\*#|0-9.]\s*)(?:projects?|key\s+projects?|personal\s+projects?|academic\s+projects?|technical\s+projects?|selected\s+projects?|notable\s+projects?|side\s+projects?)\b/i
  },
  {
    name: 'Certifications',
    regex: /(?:^|\n|[\r\n\t•\-\*#|0-9.]\s*)(?:certifications?|certificates?|licenses?\s*(?:&|and)\s*certifications?|credentials?|courses?\s*(?:&|and)\s*certifications?|professional\s+certifications?)\b/i
  },
  {
    name: 'Achievements',
    regex: /(?:^|\n|[\r\n\t•\-\*#|0-9.]\s*)(?:achievements?|accomplishments?|awards?\s*(?:&|and)\s*honors?|honors?|key\s+achievements?|notable\s+achievements?|recognitions?)\b/i
  }
];

const PROFILE_SECTION_ALIASES = {
  professionalSummary: /^(?:professional\s+summary|executive\s+summary|career\s+summary|summary|objective|about\s+me|profile|professional\s+profile)$/i,
  workExperience: /^(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|experience|internships?|employment|relevant\s+experience)$/i,
  education: /^(?:education|educational\s+background|academic\s+background|academics|academic\s+history|educational\s+qualifications?|qualifications)$/i,
  skills: /^(?:technical\s+skills?|core\s+competencies|key\s+skills?|skills|technologies|tech\s+stack|proficiencies|areas\s+of\s+expertise)$/i,
  projects: /^(?:projects?|key\s+projects?|personal\s+projects?|academic\s+projects?|technical\s+projects?|selected\s+projects?|notable\s+projects?|side\s+projects?)$/i,
  certifications: /^(?:certifications?|certificates?|credentials?|licenses?\s*(?:&|and)\s*certifications?|certifications?\s*(?:&|and)\s*(?:online\s+)?courses?|certificates?\s*(?:&|and)\s*(?:online\s+)?courses?|online\s+courses?|training)$/i,
  achievements: /^(?:achievements?|accomplishments?|awards?|honors?|recognitions?)$/i,
  languages: /^(?:languages?|languages\s+known)$/i,
  additionalInformation: /^(?:additional\s+information|interests?|hobbies|publications?|references?|declaration)$/i
};

function normalizeProfileHeader(line) {
  return String(line || '').replace(/^[\s•\-*#|\d.)]+/, '').replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').trim();
}

function extractResumeProfile(resumeText) {
  const sections = {
    name: '', personalInformation: '', professionalSummary: '', workExperience: '', education: '', skills: '',
    projects: '', certifications: '', achievements: '', languages: '', additionalInformation: ''
  };
  const lines = String(resumeText || '').split('\n').map(line => line.trim()).filter(Boolean);
  const headingIndexes = [];
  lines.forEach((line, index) => {
    const header = normalizeProfileHeader(line);
    const headerName = header.split(':')[0].trim();
    for (const [key, regex] of Object.entries(PROFILE_SECTION_ALIASES)) {
      if (regex.test(header) || regex.test(headerName)) { headingIndexes.push({ index, key }); break; }
    }
  });
  headingIndexes.forEach((heading, position) => {
    const nextIndex = headingIndexes[position + 1]?.index ?? lines.length;
    const content = lines.slice(heading.index + 1, nextIndex);
    const headerLine = lines[heading.index];
    const inlineValue = headerLine.replace(/^[\s•\-*#|\d.)]+/, '').replace(/^[^:]+:\s*/, '').trim();
    if (inlineValue && inlineValue !== headerLine.trim()) content.unshift(inlineValue);
    sections[heading.key] = content.join('\n').trim();
  });
  const firstBodyIndex = headingIndexes.length > 0 ? headingIndexes[0].index : Math.min(lines.length, 8);
  const headerLines = lines.slice(0, firstBodyIndex);
  const summaryIndex = sections.professionalSummary
    ? -1
    : headerLines.findIndex(line => line.length > 60 && !/@|https?:\/\//.test(line));
  if (summaryIndex >= 0) sections.professionalSummary = headerLines[summaryIndex];
  sections.personalInformation = headerLines.filter((_, index) => index !== summaryIndex).join('\n').trim();
  return sections;
}

/**
 * Validates that extracted text matches candidate resume structure.
 */
function validateIsResume(text) {
  if (!text || typeof text !== 'string' || text.trim().length < 60) {
    throw new Error('The uploaded document does not appear to be a resume. Please upload a valid resume.');
  }

  const matchedSections = [];
  for (const sec of RESUME_SECTIONS) {
    if (sec.regex.test(text)) {
      matchedSections.push(sec.name);
    }
  }

  // Check additional candidate resume structural signals
  const hasDates = /(?:19\d{2}|20\d{2})\s*(?:[-–—to\/]+|\s+to\s+)\s*(?:19\d{2}|20\d{2}|present|current)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19\d{2}|20\d{2})/i.test(text);
  const hasContact = /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}|\+?\d[\d\s().-]{7,}\d|linkedin\.com|github\.com/i.test(text);
  const hasSkills = COMMON_SKILLS.some(skill => {
    let pattern;
    if (skill === 'C++') pattern = /(?:^|\s)C\+\+(?:$|\s|[\.,;])/i;
    else if (skill === 'C#') pattern = /(?:^|\s)C#(?:$|\s|[\.,;])/i;
    else if (skill === '.NET') pattern = /(?:^|\s)\.NET(?:$|\s|[\.,;])/i;
    else {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    }
    return pattern.test(text);
  });
  const hasExperienceSignal = /\b(?:experience|worked|developed|built|engineer|developer|software|intern(ship|ships)?|project|projects|responsible|implemented)\b/i.test(text);
  const hasEducationSignal = /\b(?:b\.?tech|bsc|m\.?tech|master|bachelor|degree|university|college|computer science|engineering)\b/i.test(text);
  const strongResumeSignals = [hasDates, hasContact, hasSkills, hasExperienceSignal, hasEducationSignal].filter(Boolean).length;

  // Real resumes are often compact and do not follow a rigid section layout.
  // Accept them when they show a credible candidate profile: contact info + skills + experience/education.
  const hasCredibleCandidateProfile = (
    hasContact ||
    (hasDates && hasExperienceSignal && (hasSkills || hasEducationSignal))
  );
  const isResume = (
    (matchedSections.length >= 2 && hasCredibleCandidateProfile) ||
    (matchedSections.length >= 1 && strongResumeSignals >= 3) ||
    (hasContact && hasSkills && (hasExperienceSignal || hasEducationSignal || hasDates))
  );

  if (!isResume) {
    throw new Error('The uploaded document does not appear to be a resume. Please upload a valid resume.');
  }

  return {
    valid: true,
    matchedSections
  };
}

const INVALID_NAME_TERMS = new Set([
  'resume', 'curriculum vitae', 'curriculum', 'vitae', 'cv', 'biodata', 'bio data', 'bio-data', 'profile',
  'summary', 'professional summary', 'executive summary', 'career summary', 'summary of qualifications',
  'professional profile', 'career objective', 'objective', 'about me', 'about', 'personal profile', 'personal details',
  'contact', 'contact info', 'contact information', 'contact details',
  'experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history',
  'career history', 'relevant experience', 'internship', 'internships',
  'education', 'educational background', 'academic background', 'academics', 'academic history', 'qualifications',
  'educational qualifications',
  'skills', 'technical skills', 'core competencies', 'key skills', 'technologies', 'tech stack',
  'programming languages', 'proficiencies', 'expertise', 'areas of expertise', 'tools & frameworks', 'tools and frameworks',
  'projects', 'academic projects', 'personal projects', 'key projects', 'notable projects', 'technical projects', 'selected projects',
  'certifications', 'certification', 'certificates', 'certificate', 'online courses', 'courses',
  'certifications & online courses', 'certifications and online courses', 'courses & certifications',
  'licenses & certifications', 'credentials', 'training',
  'achievements', 'accomplishments', 'awards', 'honors', 'awards & honors', 'awards and honors',
  'key achievements', 'notable achievements', 'recognitions',
  'publications', 'research', 'languages', 'languages known', 'hobbies', 'interests', 'declaration', 'references', 'page',
  'software engineer', 'software developer', 'full stack developer', 'full stack engineer', 'fullstack developer', 'fullstack engineer',
  'frontend developer', 'frontend engineer', 'backend developer', 'backend engineer', 'web developer', 'mobile developer',
  'ios developer', 'android developer', 'devops engineer', 'cloud engineer', 'cloud architect', 'data scientist',
  'data analyst', 'data engineer', 'machine learning engineer', 'ai engineer', 'qa engineer', 'system administrator',
  'product manager', 'project manager', 'solution architect', 'technical lead', 'team lead', 'developer', 'engineer',
  'architect', 'consultant', 'specialist', 'associate'
]);

const NON_NAME_TOKENS = new Set([
  'and', 'or', 'the', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'from', 'about',
  'as', 'an', 'a', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'be', 'been', 'being',
  'my', 'me', 'our', 'your', 'his', 'her', 'their', 'its', 'who', 'which', 'that', 'this',
  'resume', 'curriculum', 'vitae', 'cv', 'biodata', 'profile', 'summary', 'objective',
  'education', 'educational', 'academic', 'academics', 'qualification', 'qualifications',
  'experience', 'employment', 'career', 'intern', 'internship', 'internships', 'work',
  'projects', 'project', 'skills', 'skill', 'competencies', 'expertise', 'proficiencies',
  'certifications', 'certification', 'certified', 'certificates', 'certificate',
  'courses', 'course', 'online', 'training', 'credentials', 'licenses',
  'achievements', 'achievement', 'accomplishments', 'accomplishment', 'awards', 'award',
  'honors', 'honor', 'publications', 'publication', 'activities', 'activity',
  'interests', 'interest', 'hobbies', 'hobby', 'references', 'reference', 'declaration',
  'languages', 'language', 'page',
  'contact', 'details', 'personal', 'info', 'information', 'phone', 'mobile', 'tel', 'telephone',
  'cell', 'email', 'mail', 'gmail', 'yahoo', 'hotmail', 'outlook', 'linkedin', 'github',
  'gitlab', 'portfolio', 'website', 'address', 'city', 'state', 'country', 'zip', 'postal',
  'india', 'usa', 'street', 'road', 'lane',
  'engineer', 'engineering', 'developer', 'development', 'architect', 'architecture',
  'programmer', 'programming', 'coder', 'coding', 'designer', 'designing', 'analyst',
  'consultant', 'specialist', 'manager', 'management', 'lead', 'leader', 'leadership',
  'senior', 'junior', 'associate', 'executive', 'officer', 'director', 'founder', 'student',
  'candidate', 'applicant', 'member', 'head', 'coordinator', 'administrator', 'admin',
  'experienced', 'skilled', 'built', 'building', 'developed', 'developing', 'designed',
  'implemented', 'implementing', 'created', 'creating', 'managed', 'managing', 'working',
  'solutions', 'services', 'systems', 'system', 'technologies', 'technology', 'tech',
  'api', 'apis', 'rest', 'restful', 'graphql', 'grpc', 'soap',
  'sql', 'nosql', 'mysql', 'postgresql', 'postgres', 'sqlite', 'mongodb', 'redis', 'cassandra', 'dynamodb',
  'python', 'java', 'javascript', 'typescript', 'golang', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'dart',
  'react', 'redux', 'angular', 'vue', 'svelte', 'nextjs', 'next', 'express', 'nestjs', 'django', 'flask', 'fastapi',
  'spring', 'springboot', 'bootstrap', 'tailwind', 'html', 'html5', 'css', 'css3', 'sass', 'scss',
  'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'cloud', 'devops', 'ci', 'cd', 'cicd',
  'git', 'linux', 'unix', 'bash', 'shell', 'windows', 'macos', 'android', 'ios', 'web', 'mobile',
  'ai', 'ml', 'nlp', 'llm', 'llms', 'data', 'database', 'databases', 'backend', 'frontend', 'fullstack',
  'machine', 'learning', 'deep', 'neural', 'intelligence', 'artificial', 'model', 'models',
  'algorithm', 'algorithms', 'structures', 'pipeline', 'pipelines',
  'university', 'college', 'school', 'institute', 'institution', 'department', 'campus',
  'bachelor', 'bachelors', 'master', 'masters', 'doctor', 'doctorate', 'phd',
  'btech', 'mtech', 'bsc', 'msc', 'bca', 'mca', 'be', 'me', 'mba', 'bba',
  'degree', 'diploma', 'cgpa', 'gpa', 'percentage', 'grade', 'score', 'marks', 'division',
  'science', 'sciences', 'arts', 'commerce', 'engineering', 'ltd', 'inc', 'corp', 'company'
]);

function isValidCandidateName(str) {
  if (!str || typeof str !== 'string') return false;
  const clean = str.replace(/\s+/g, ' ').trim();
  if (clean.length < 3 || clean.length > 35) return false;
  if (/[0-9@&_:+*#=<>\\\/;!?[\]{}()~^$]/.test(clean)) return false;

  const lower = clean.toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  if (INVALID_NAME_TERMS.has(lower)) return false;

  // Check alphanumeric collapsed string (rejects spaced-out section titles like "SUMMAR Y" or "S U M M A R Y")
  const noSpace = clean.toLowerCase().replace(/[^a-z]/g, '');
  if (INVALID_NAME_TERMS.has(noSpace)) return false;

  for (const term of INVALID_NAME_TERMS) {
    if (lower === term || lower.startsWith(term + ' ') || lower.endsWith(' ' + term)) {
      return false;
    }
  }

  const words = clean.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;

  // For a 2-word name, ensure at least one word is not an initial (avoids abbreviations like "C V")
  if (words.length === 2 && words[0].replace(/['.-]/g, '').length < 2 && words[1].replace(/['.-]/g, '').length < 2) {
    return false;
  }

  for (const w of words) {
    if (!/^[A-Za-z][A-Za-z'.-]*$/.test(w)) return false;
    const wLower = w.toLowerCase().replace(/['.-]/g, '');
    // Check against non-name vocabulary only if token is multi-character (preserves valid initials like "A.")
    if (wLower.length > 1 && NON_NAME_TOKENS.has(wLower)) return false;
  }

  const allCapitalized = words.every(w => /^[A-Z]/.test(w));
  if (!allCapitalized) return false;

  return true;
}

function toTitleCase(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .split(/\s+/)
    .map(w => {
      if (/^[A-Z]\.?$/i.test(w)) return w.toUpperCase();
      if (w.includes('-')) {
        return w.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('-');
      }
      if (w.includes("'")) {
        return w.split("'").map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join("'");
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function isBodySectionHeader(line) {
  if (!line || line.length > 50) return false;
  const clean = line.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const noSpace = clean.replace(/\s+/g, '');
  
  const sectionKeywords = [
    'summary', 'professionalsummary', 'executivesummary', 'careersummary', 'objective', 'careerobjective', 'aboutme',
    'education', 'educationalbackground', 'academicbackground', 'academics', 'qualifications',
    'experience', 'workexperience', 'professionalexperience', 'employment', 'employmenthistory', 'workhistory',
    'skills', 'technicalskills', 'corecompetencies', 'keyskills', 'technologies', 'techstack',
    'projects', 'academicprojects', 'personalprojects', 'keyprojects',
    'certifications', 'certification', 'certificates', 'onlinecourses',
    'achievements', 'accomplishments', 'awards', 'honors'
  ];

  if (sectionKeywords.includes(noSpace) || sectionKeywords.includes(clean)) {
    return true;
  }

  return RESUME_SECTIONS.some(sec => sec.regex.test(line) && line.split(/\s+/).length <= 5);
}

function extractNameFromLine(rawLine) {
  if (!rawLine) return null;
  const line = rawLine.replace(/\s+/g, ' ').trim();
  
  // Reject long lines / sentences immediately
  if (line.split(/\s+/).length > 5) return null;

  // Reject lines containing sentence conjunctions, prepositions, or verbs
  if (/\b(with|in|and|or|for|at|to|from|by|on|about|experienced|developed|building|focus|using)\b/i.test(line)) {
    return null;
  }

  // Check "LastName, FirstName" format
  const commaMatch = line.match(/^([A-Z][a-z]+),\s*([A-Z][a-z]+)$/);
  if (commaMatch) {
    const candidate = `${commaMatch[2]} ${commaMatch[1]}`;
    if (isValidCandidateName(candidate)) return candidate;
  }

  if (isValidCandidateName(line)) return line;

  // Split only by header separators (pipes, bullets, em-dash, en-dash) - do not split sentences by comma
  const parts = line.split(/[|•—–]/).map(p => p.trim());
  if (parts.length > 1 && isValidCandidateName(parts[0])) {
    return parts[0];
  }
  return null;
}

function extractNameFromFilename(originalName) {
  if (!originalName || typeof originalName !== 'string') return null;
  const baseName = path.basename(originalName, path.extname(originalName))
    .replace(/[_-]?[A-Za-z0-9]*\d{4,}$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const words = baseName.split(' ').filter(Boolean);
  if (words.length < 2) return null;
  const candidate = words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  return isValidCandidateName(candidate) ? candidate : null;
}

/**
 * Scans the entire resume text and dynamically extracts all technical and soft skills,
 * including programming languages, web/backend technologies, machine learning/AI,
 * databases, tools/platforms, software engineering concepts, and soft skills.
 */
function extractSkillsFromResume(resumeText) {
  if (!resumeText || typeof resumeText !== 'string') return [];

  const detectedSkills = [];
  const seenLower = new Set();

  function addSkill(skill) {
    if (!skill || typeof skill !== 'string') return;
    let s = skill.trim().replace(/^[-–—•\*\s,;:()]+|[-–—•\*\s,;:()]+$/g, '');
    if (!s || s.length < 2 || s.length > 45) return;

    // Normalize casing for common acronyms and technical names
    if (/^my\s*sql$/i.test(s)) s = 'MySQL';
    else if (/^python$/i.test(s)) s = 'Python';
    else if (/^java$/i.test(s)) s = 'Java';
    else if (/^javascript$/i.test(s)) s = 'JavaScript';
    else if (/^typescript$/i.test(s)) s = 'TypeScript';
    else if (/^html5?$/i.test(s)) s = s.toUpperCase();
    else if (/^css3?$/i.test(s)) s = s.toUpperCase();
    else if (/^rest(?:\s*apis?)?$/i.test(s)) s = 'REST APIs';
    else if (/^scikit-?learn$/i.test(s)) s = 'Scikit-learn';
    else if (/^pandas$/i.test(s)) s = 'Pandas';
    else if (/^numpy$/i.test(s)) s = 'NumPy';
    else if (/^gen-?ai$/i.test(s)) s = 'Gen-AI';
    else if (/^power\s*bi$/i.test(s)) s = 'Power BI';
    else if (/^git$/i.test(s)) s = 'Git';
    else if (/^github$/i.test(s)) s = 'GitHub';
    else if (/^mongodb$/i.test(s)) s = 'MongoDB';
    else if (/^data\s*structures?$/i.test(s)) s = 'Data Structures';
    else if (/^oop$/i.test(s)) s = 'OOP';
    else if (/^object-oriented\s*programming$/i.test(s)) s = 'Object-Oriented Programming';
    else if (/^json$/i.test(s)) s = 'JSON';
    else if (/^jdbc$/i.test(s)) s = 'JDBC';
    else if (/^sql$/i.test(s)) s = 'SQL';
    else if (/^nosql$/i.test(s)) s = 'NoSQL';
    else if (/^mern(?:\s*stack)?$/i.test(s)) s = 'MERN Stack';
    else if (/^spring\s*boot$/i.test(s)) s = 'Spring Boot';
    else if (/^flask$/i.test(s)) s = 'Flask';
    else if (/^django$/i.test(s)) s = 'Django';

    const key = s.toLowerCase();
    const noise = new Set([
      'overview', 'features', 'key features', 'project', 'projects', 'technologies',
      'used', 'frontend', 'backend', 'db', 'database', 'details', 'aug', 'apr', 'may',
      'jun', 'jul', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'year', 'years',
      'b.tech', 'cgpa', 'gpa', 'developer', 'engineer', 'intern', 'experience'
    ]);
    if (noise.has(key)) return;

    if (!seenLower.has(key)) {
      seenLower.add(key);
      detectedSkills.push(s);
    }
  }

  const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. DYNAMIC SKILLS SECTION PARSER
  // Extracts any and all skills explicitly listed under Skills / Technical Skills / Tech Stack sections
  const sectionStopKeywords = [
    'experience', 'work experience', 'professional experience', 'employment', 'employment history',
    'education', 'academic background', 'academics', 'qualifications',
    'projects', 'academic projects', 'key projects', 'notable projects', 'technical projects',
    'certifications', 'certifications & online courses', 'certifications and online courses', 'certificates',
    'achievements', 'accomplishments', 'awards', 'honors', 'publications', 'languages known'
  ];

  const skillHeaderIdx = lines.findIndex(l => {
    const clean = l.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    return /^(?:technical\s+|key\s+|core\s+)?(?:skills|competencies|technologies|proficiencies|tech\s+stack)(?:\s*(?:&|and)\s*tools)?$/i.test(clean) ||
           /^skills\s*&?\s*technologies$/i.test(clean);
  });

  if (skillHeaderIdx !== -1) {
    for (let i = skillHeaderIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const cleanHeaderTest = line.replace(/[^a-zA-Z\s&]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      const noSpace = cleanHeaderTest.replace(/\s+/g, '');
      const isHeader = sectionStopKeywords.some(kw => {
        const kwNoSpace = kw.replace(/\s+/g, '');
        return cleanHeaderTest === kw || cleanHeaderTest.startsWith(kw + ' ') || noSpace === kwNoSpace || noSpace.startsWith(kwNoSpace);
      });
      if (isHeader) break;

      let content = line.replace(/^[\s•\-\*·►▪▫\d.]+\s*/, '').trim();
      const colonIdx = content.indexOf(':');
      if (colonIdx !== -1 && colonIdx < 40) {
        content = content.slice(colonIdx + 1).trim();
      } else {
        const dashMatch = content.match(/^([A-Za-z\s\/&|]{3,35})\s+[–—-]\s+(.+)$/);
        if (dashMatch) content = dashMatch[2].trim();
      }

      const items = content.split(/[,•|;·]|\s+\/\s+/);
      for (const rawItem of items) {
        const item = rawItem.trim();
        if (!item) continue;
        const parenMatch = item.match(/^([^(]+)\s*\(([^)]+)\)$/);
        if (parenMatch) {
          addSkill(parenMatch[2].trim()); // e.g. OOP
          addSkill(parenMatch[1].trim()); // e.g. Object-Oriented Programming
        } else {
          addSkill(item);
        }
      }
    }
  }

  // 2. DYNAMIC PROJECT & EXPERIENCE TECH LINES
  for (const line of lines) {
    const techMatch = line.match(/(?:technologies\s+used|tech\s+stack|tools\s+used|environment)\s*[:–—-]\s*(.+)$/i);
    if (techMatch) {
      const content = techMatch[1];
      const parenRegex = /(?:frontend|backend|database|db|tools|frameworks)?\s*\(([^)]+)\)/gi;
      let m;
      while ((m = parenRegex.exec(content)) !== null) {
        m[1].split(/[,/|]/).forEach(t => addSkill(t.trim()));
      }
      const remaining = content.replace(parenRegex, ' ')
        .replace(/\b(frontend|backend|database|db|tools|frameworks|technologies|stack)\b/gi, ' ');
      remaining.split(/[,/|;•]/).forEach(t => addSkill(t.trim()));
    }
  }

  // 3. FULL RESUME TAXONOMY SCAN
  // Scans all resume text (summary, experience bullets, project descriptions, certifications)
  const normalizedFullText = ` ${resumeText.replace(/[\n,;()]/g, ' ')} `;

  for (const skill of TECH_TAXONOMY) {
    let pattern;
    if (skill === 'C++') {
      pattern = /(?:^|\s)C\+\+(?:$|\s|[\.,;])/i;
    } else if (skill === 'C#') {
      pattern = /(?:^|\s)C#(?:$|\s|[\.,;])/i;
    } else if (skill === '.NET') {
      pattern = /(?:^|\s)\.NET(?:$|\s|[\.,;])/i;
    } else if (skill === 'R') {
      pattern = /(?:^|\s)R(?:$|\s|[\.,;])/;
    } else if (skill === 'AI') {
      pattern = /(?:^|\s)AI(?:$|\s|[\.,;])/;
    } else {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    }

    if (pattern.test(normalizedFullText)) {
      addSkill(skill);
    }
  }

  return detectedSkills;
}

/**
 * Extracts candidate metadata and skills from resume text.
 */
function analyzeResumeText(resumeText, originalName = '') {
  // Validate that document has valid resume structure before parsing
  validateIsResume(resumeText);

  const lines = resumeText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 1. Detect candidate name using document header/top section
  let detectedName = '';
  let nameFromFilename = false;
  // Check top 10 lines for candidate name; stop if entering body sections
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];

    if (isBodySectionHeader(line)) {
      break;
    }

    const extracted = extractNameFromLine(line);
    if (extracted) {
      detectedName = toTitleCase(extracted);
      break;
    }
  }

  // If the name cannot be confidently detected, show "Candidate" instead of an incorrect section heading
  if (!detectedName) {
    const filenameName = extractNameFromFilename(originalName);
    detectedName = filenameName || 'Candidate';
    nameFromFilename = Boolean(filenameName);
  }

  // 2. Detect technical and soft skills dynamically across the entire resume
  const uniqueSkills = extractSkillsFromResume(resumeText);
  const profileSections = extractResumeProfile(resumeText);
  profileSections.name = detectedName || 'Candidate';
  profileSections.personalInformation = profileSections.personalInformation
    .split('\n')
    .filter(line => line.trim().toLowerCase() !== detectedName.trim().toLowerCase())
    .join('\n')
    .trim();

  // 3. Detect headline / role
  let detectedRole = '';
  const roleKeywords = [
    'Software Engineer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer',
    'DevOps Engineer', 'Cloud Architect', 'Data Scientist', 'Data Engineer', 'Machine Learning Engineer',
    'AI Engineer', 'System Architect', 'Mobile Developer', 'iOS Developer', 'Android Developer',
    'QA Engineer', 'Product Manager'
  ];

  for (const rk of roleKeywords) {
    const reg = new RegExp(`\\b${rk}\\b`, 'i');
    if (reg.test(resumeText)) {
      detectedRole = rk;
      break;
    }
  }
  if (!detectedRole) {
    detectedRole = uniqueSkills.length > 0 ? `${uniqueSkills[0]} Developer` : 'Software Professional';
  }

  // 4. Brief summary preview
  let summary = '';
  const summaryHeaderIdx = lines.findIndex(l => /^(summary|profile|about me|objective|professional summary)/i.test(l));
  if (summaryHeaderIdx !== -1 && lines[summaryHeaderIdx + 1]) {
    summary = lines.slice(summaryHeaderIdx + 1, summaryHeaderIdx + 4).join(' ');
  } else {
    // Pick first substantial paragraph
    const paragraph = lines.find(l => l.length > 60 && !/@|http|\+?\d/.test(l));
    summary = paragraph ? paragraph : lines.slice(0, 3).join(' ');
  }
  if (summary.length > 250) {
    summary = summary.slice(0, 247) + '...';
  }

  // 5. Build personalized greeting
  const isGeneric = (!detectedName || detectedName.toLowerCase() === 'candidate');
  const nameParts = detectedName.split(' ');
  const nameSalutation = isGeneric ? 'Candidate' : (nameFromFilename ? nameParts[nameParts.length - 1] : nameParts[0]);
  const topSkillStr = uniqueSkills.slice(0, 3).join(', ');
  const greeting = `Hello ${nameSalutation}! I've reviewed your resume and noted your experience${topSkillStr ? ` with ${topSkillStr}` : ''}. Welcome to your AI technical interview. Whenever you're ready, let's start with a brief introduction about yourself and your background.`;

  // 6. Dynamic suggestions for the UI "Try saying:"
  const suggestedQuestions = [];
  if (uniqueSkills.length > 0) {
    suggestedQuestions.push(`"Can we discuss my experience with ${uniqueSkills[0]}?"`);
  }
  if (uniqueSkills.length > 1) {
    suggestedQuestions.push(`"Ask me a technical question about ${uniqueSkills[1]}."`);
  }
  suggestedQuestions.push('"Give me a scenario-based system design question."');
  suggestedQuestions.push('"Ask me a behavioral question about teamwork."');

  return {
    name: detectedName || 'Candidate',
    role: detectedRole,
    skills: uniqueSkills,
    summary,
    sections: profileSections,
    greeting,
    suggestedQuestions
  };
}

module.exports = {
  extractTextFromFile,
  analyzeResumeText,
  validateIsResume,
  extractSkillsFromResume
};

