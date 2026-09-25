const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeResumeText, validateIsResume } = require('../src/services/resume-parser.service');

test('accepts a realistic compact resume with skills and experience but no strict section headings', () => {
  const resume = `
    Krishna Singh
    Senior Software Engineer
    krishna.singh@email.com | +91 98765 43210 | LinkedIn: linkedin.com/in/krishna

    Experienced backend engineer with 5+ years building distributed services in Java, Python, and SQL.

    Skills: Java, Python, Spring Boot, PostgreSQL, Docker, AWS, REST APIs, Git

    Experience
    Software Engineer, Acme Tech | 2022 - Present
    - Built microservices in Java and Spring Boot
    - Improved API reliability and reduced latency by 30%

    Education
    B.Tech in Computer Science, IIT Delhi, 2021
  `;

  assert.doesNotThrow(() => validateIsResume(resume));
  const parsed = analyzeResumeText(resume);
  assert.match(parsed.name, /Krishna/i);
  assert.ok(parsed.skills.length > 0);
  assert.ok(parsed.summary.length > 0);
  assert.doesNotMatch(parsed.sections.personalInformation, /Krishna Singh/);
  assert.match(parsed.sections.personalInformation, /krishna\.singh@email\.com/);
  assert.match(parsed.sections.professionalSummary, /Experienced backend engineer/);
  assert.match(parsed.sections.workExperience, /Built microservices/);
  assert.match(parsed.sections.education, /B\.Tech/);
  assert.match(parsed.sections.skills, /Spring Boot/);
});

test('uses a readable resume filename when the document header has no name', () => {
  const resume = `
    Professional Summary
    Software developer with experience building web applications.

    Skills
    Python, SQL, HTML, CSS

    Experience
    Software Developer | 2022 - Present
    Built and maintained internal applications.

    Education
    Bachelor of Engineering, 2021
  `;

  const parsed = analyzeResumeText(resume, 'VaranasiSathwika_22WU0101103.pdf');
  assert.equal(parsed.name, 'Varanasi Sathwika');
  assert.match(parsed.greeting, /^Hello Sathwika!/);
});

test('rejects a non-resume document with generic section words', () => {
  const document = `
    Project Notes
    Summary of today's meeting and objectives.
    Skills required for the project include planning and communication.
    Experience includes testing the new process.
    Education topics were discussed during training.
  `;

  assert.throws(() => validateIsResume(document), /does not appear to be a resume/i);
});
