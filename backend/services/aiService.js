const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function generateMatchPrediction(match) {
  const prompt = `You are an expert football analyst. Analyze this Premier League match and return ONLY a valid JSON object with no extra text, no markdown, no backticks.

Match: ${match.homeTeam} vs ${match.awayTeam}
League: ${match.leagueName}
Kickoff: ${match.kickoff}
Home form (last 5): ${match.stats?.homeForm || 'Unknown'}
Away form (last 5): ${match.stats?.awayForm || 'Unknown'}
Home goals avg: ${match.stats?.homeGoalsAvg || 'Unknown'}
Away goals avg: ${match.stats?.awayGoalsAvg || 'Unknown'}

Return ONLY this exact JSON structure:
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
  "verdict": "Your 2-3 sentence analysis here."
}`;

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      },
      { timeout: 30000 }
    );

    const raw = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) throw new Error('Empty response from Gemini');

    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Normalize probabilities to sum to 100
    const total = (parsed.probHome || 0) + (parsed.probDraw || 0) + (parsed.probAway || 0);
    if (total !== 100 && total > 0) {
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
  const systemText = `You are GoalIQ, a world-class football analyst AI. You provide sharp, data-driven insights about football matches, team form, player performance, tactics, and transfers. Keep responses concise and engaging — 3 to 5 sentences max unless asked for more detail. Be confident but honest about uncertainty. ${context ? 'Context: ' + context : ''}`;

  // Build conversation for Gemini
  const geminiMessages = [];

  // Add system context as first exchange
  geminiMessages.push({
    role: 'user',
    parts: [{ text: systemText + '\n\nAcknowledge you are ready.' }],
  });
  geminiMessages.push({
    role: 'model',
    parts: [{ text: 'Ready! I am GoalIQ, your football intelligence assistant. Ask me anything about football.' }],
  });

  // Add conversation history
  for (const msg of messages) {
    geminiMessages.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: geminiMessages,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 600,
        },
      },
      { timeout: 30000 }
    );

    const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('Empty chat response from Gemini');
    return reply;

  } catch (err) {
    console.error('Gemini chat error:', err.response?.data || err.message);
    throw new Error('AI service temporarily unavailable. Please try again.');
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
    btts: 50,
    over25: 55,
    scoreline: winner === 'home' ? '2-1' : winner === 'away' ? '1-2' : '1-1',
    verdict: `Based on current form, ${match.homeTeam} host ${match.awayTeam} in what promises to be a competitive ${match.leagueName} fixture. Home advantage could be a key factor in this match.`,
  };
}

module.exports = { generateMatchPrediction, chatWithAI };
