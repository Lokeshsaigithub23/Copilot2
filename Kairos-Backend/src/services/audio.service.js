async function transcribeAudioWithDeepgram(audioUrl) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY environment variable is not set.');

  const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
  deepgramUrl.searchParams.set('model', 'nova-2');
  deepgramUrl.searchParams.set('smart_format', 'true');
  deepgramUrl.searchParams.set('language', 'en');
  deepgramUrl.searchParams.set('paragraphs', 'true');
  const response = await fetch(deepgramUrl, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: audioUrl })
  });
  if (!response.ok) throw new Error(`Deepgram API ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return { transcript: payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '', raw: payload };
}

module.exports = { transcribeAudioWithDeepgram };
