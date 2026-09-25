const test = require('node:test');
const assert = require('node:assert/strict');

const { isPersonalQuestion, buildResumeContextPrompt } = require('../copilotEngine');

test('uses resume context for personal background questions', () => {
  assert.equal(isPersonalQuestion('Tell me about yourself'), true);
  assert.match(
    buildResumeContextPrompt('Tell me about yourself', 'Alex built Node.js services.'),
    /Alex built Node\.js services/,
  );
});

test('does not add personal resume context to technical questions', () => {
  assert.equal(isPersonalQuestion('Explain REST APIs'), false);
  assert.equal(buildResumeContextPrompt('Explain REST APIs', 'Alex built Node.js services.'), '');
});

test('uses the completed profile form with resume context for personal questions', () => {
  const prompt = buildResumeContextPrompt('Tell me about yourself', JSON.stringify({
    resumeText: 'Alex built Node.js services.',
    profile: {
      name: 'Alex Johnson',
      professionalSummary: 'Backend engineer focused on reliable APIs.'
    }
  }));
  assert.match(prompt, /Alex Johnson/);
  assert.match(prompt, /Backend engineer focused on reliable APIs/);
  assert.match(prompt, /Never say that you are an AI/);
});
