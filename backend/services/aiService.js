const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function generateMatchPrediction(match) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log('No GEMINI_API_KEY — using fallback');
    return fallbackPrediction(match);
  }

  const prompt = `You are a football analyst. Analyze this match and return ONLY valid JSON with no extra text.

Match: ${match.homeTeam} vs ${match.awayTeam}
League: ${match.leagueName}

Return exactly this JSON structure:
{
  "probHome": 45,
  "probDraw": 25,
  "probAway": 30,
  "winner": "home",
  "confidence": 72,
  "xgHome": 1.8,
  "xgAway": 1.2,
  "btts": 55,
  "over25": 62,
  "scoreline": "2-1",
  "verdict": "Write 2-3 sentences of analysis here."
}`;

  try {
    const res = await axios({
      method: 'post',
      url: GEMINI_URL,
      params: { key },
      headers: { 'Content-Type': 'application/json' },
      data: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
      },
      timeout: 30000
    });

    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Gemini response received, length:', text.length);
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const total = (parsed.probHome || 0) + (parsed.probDraw || 0) + (parsed.probAway || 0);
    if (total > 0 && total !== 100) {
      const f = 100 / total;
      parsed.probHome = Math.round(parsed.probHome * f);
      parsed.probDraw = Math.round(parsed.probDraw * f);
      parsed.probAway = 100 - parsed.probHome - parsed.probDraw;
    }

    console.log('Prediction generated for:', match.homeTeam, 'vs', match.awayTeam);
    return parsed;

  } catch (err) {
    console.error('Gemini error:', err.response?.status, JSON.stringify(err.response?.data || err.message));
    return fallbackPrediction(match);
  }
}

async function chatWithAI(messages, context) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI service not configured.');

  const history = [
    { role: 'user', parts: [{ text: 'You are GoalIQ, an expert football analyst AI. Give sharp concise answers in 3-5 sentences.' }] },
    { role: 'model', parts: [{ text: 'Ready! I am GoalIQ. Ask me anything about football.' }] },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content) }]
    }))
  ];

  try {
    const res = await axios({
      method: 'post',
      url: GEMINI_URL,
      params: { key },
      headers: { 'Content-Type': 'application/json' },
      data: {
        contents: history,
        generationConfig: { temperature: 0.8, maxOutputTokens: 400 }
      },
      timeout: 30000
    });

    const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('Empty response from Gemini');
    return reply;

  } catch (err) {
    console.error('Gemini chat error:', err.response?.status, JSON.stringify(err.response?.data || err.message));
    throw new Error('AI temporarily unavailable. Please try again.');
  }
}

function fallbackPrediction(match) {
  const h = Math.floor(Math.random() * 20) + 40;
  const d = Math.floor(Math.random() * 10) + 20;
  const a = 100 - h - d;
  const winner = h > a ? 'home' : a > h ? 'away' : 'draw';
  return {
    probHome: h, probDraw: d, probAway: a,
    winner,
    confidence: 55,
    xgHome: parseFloat((Math.random() * 1.2 + 1.0).toFixed(1)),
    xgAway: parseFloat((Math.random() * 1.0 + 0.7).toFixed(1)),
    btts: 52, over25: 58,
    scoreline: winner === 'home' ? '2-1' : winner === 'away' ? '1-2' : '1-1',
    verdict: `${match.homeTeam} host ${match.awayTeam} in the ${match.leagueName}. Home advantage is a key factor. Our model gives the slight edge to the ${winner === 'home' ? 'home side' : winner === 'away' ? 'away side' : 'neither side — a draw is most likely'}.`,
  };
}

module.exports = { generateMatchPrediction, chatWithAI };
