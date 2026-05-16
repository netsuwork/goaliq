const axios = require('axios');

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function generateMatchPrediction(match) {
  const prompt = `You are a football analyst. Analyze this match and return ONLY a JSON object, no markdown, no extra text.

Match: ${match.homeTeam} vs ${match.awayTeam}
League: ${match.leagueName}
Home form: ${match.stats?.homeForm || 'Unknown'}
Away form: ${match.stats?.awayForm || 'Unknown'}
Home goals avg: ${match.stats?.homeGoalsAvg || 0}
Away goals avg: ${match.stats?.awayGoalsAvg || 0}
Home odds: ${match.odds?.home || 2.5}
Draw odds: ${match.odds?.draw || 3.2}
Away odds: ${match.odds?.away || 3.0}

Return ONLY this JSON:
{
  "probHome": <0-100>,
  "probDraw": <0-100>,
  "probAway": <0-100>,
  "winner": "<home|draw|away>",
  "confidence": <0-100>,
  "xgHome": <float>,
  "xgAway": <float>,
  "btts": <0-100>,
  "over25": <0-100>,
  "scoreline": "<e.g. 2-1>",
  "verdict": "<2-3 sentence analysis>"
}`;

  try {
    const response = await axios.post(
      `${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
      }
    );

    const raw = response.data.candidates[0].content.parts[0].text.trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Normalize to 100
    const total = parsed.probHome + parsed.probDraw + parsed.probAway;
    if (total !== 100) {
      const f = 100 / total;
      parsed.probHome = Math.round(parsed.probHome * f);
      parsed.probDraw = Math.round(parsed.probDraw * f);
      parsed.probAway = 100 - parsed.probHome - parsed.probDraw;
    }

    return parsed;
  } catch (err) {
    console.error('Gemini prediction error:', err.response?.data || err.message);
    return fallbackPrediction(match);
  }
}

async function chatWithAI(messages, context = '') {
  const systemText = `You are GoalIQ, a world-class football analyst AI. Give sharp, data-driven insights on predictions, team form, tactics and transfers. Keep responses to 3-5 sentences. ${context ? 'Context: ' + context : ''}`;

  // Convert messages to Gemini format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  // Add system as first user message if not present
  if (contents[0]?.role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: systemText }] });
    contents.splice(1, 0, { role: 'model', parts: [{ text: 'Understood! I am GoalIQ, ready to analyze football for you.' }] });
  }

  try {
    const response = await axios.post(
      `${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 500 }
      }
    );
    return response.data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error('Gemini chat error:', err.response?.data || err.message);
    throw new Error('AI service temporarily unavailable.');
  }
}

function fallbackPrediction(match) {
  const odds = match.odds || { home: 2.5, draw: 3.2, away: 3.0 };
  const implied = {
    h: 1 / (odds.home || 2.5),
    d: 1 / (odds.draw || 3.2),
    a: 1 / (odds.away || 3.0),
  };
  const total = implied.h + implied.d + implied.a;
  const probHome = Math.round((implied.h / total) * 100);
  const probDraw = Math.round((implied.d / total) * 100);
  const probAway = 100 - probHome - probDraw;
  const winner = probHome > probDraw && probHome > probAway ? 'home'
    : probAway > probDraw ? 'away' : 'draw';

  return {
    probHome, probDraw, probAway, winner,
    confidence: 55,
    xgHome: parseFloat((Math.random() * 1.5 + 0.8).toFixed(1)),
    xgAway: parseFloat((Math.random() * 1.2 + 0.6).toFixed(1)),
    btts: 50, over25: 55,
    scoreline: winner === 'home' ? '2-1' : winner === 'away' ? '1-2' : '1-1',
    verdict: `Prediction based on current odds. ${match.homeTeam} are the home side in this ${match.leagueName} fixture.`,
  };
}

module.exports = { generateMatchPrediction, chatWithAI };
