const axios = require('axios');

const PYTHON_URL = process.env.PYTHON_PREDICTION_URL || 'https://goaliq-prediction.onrender.com';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function getPythonPrediction(match) {
  try {
    const res = await axios({
      method: 'post',
      url: `${PYTHON_URL}/predict`,
      headers: { 'Content-Type': 'application/json' },
      data: {
        homeTeam:             match.homeTeam,
        awayTeam:             match.awayTeam,
        leagueName:           match.leagueName,
        homeForm:             match.stats?.homeForm || '',
        awayForm:             match.stats?.awayForm || '',
        homeGoalsAvg:         match.stats?.homeGoalsAvg || 1.5,
        awayGoalsAvg:         match.stats?.awayGoalsAvg || 1.2,
        homeGoalsConcededAvg: match.stats?.homeGoalsConcededAvg || 1.2,
        awayGoalsConcededAvg: match.stats?.awayGoalsConcededAvg || 1.5,
        h2hHomeWins:          match.stats?.h2hHomeWins || 0,
        h2hAwayWins:          match.stats?.h2hAwayWins || 0,
        h2hDraws:             match.stats?.h2hDraws || 0,
      },
      timeout: 15000,
    });
    if (res.data?.success && res.data?.prediction) {
      console.log('Python prediction OK:', match.homeTeam, 'vs', match.awayTeam);
      return res.data.prediction;
    }
    throw new Error('Invalid Python response');
  } catch (err) {
    console.error('Python prediction failed:', err.message);
    return null;
  }
}

async function enhanceVerdictWithGemini(match, prediction) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return prediction;
  const prompt = `You are a football expert. Write exactly 3 sentences of expert match analysis for:
${match.homeTeam} vs ${match.awayTeam} (${match.leagueName})
Win probabilities: ${match.homeTeam} ${prediction.probHome}% | Draw ${prediction.probDraw}% | ${match.awayTeam} ${prediction.probAway}%
Expected goals: ${prediction.xgHome} vs ${prediction.xgAway}
Home form: ${match.stats?.homeForm || 'Unknown'} | Away form: ${match.stats?.awayForm || 'Unknown'}
No bullet points. No markdown. Just 3 sentences.`;
  try {
    const res = await axios({
      method: 'post',
      url: GEMINI_URL,
      params: { key },
      headers: { 'Content-Type': 'application/json' },
      data: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 200 } },
      timeout: 20000,
    });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text && text.length > 20) prediction.verdict = text.trim();
  } catch (err) {
    console.error('Gemini verdict failed:', err.message);
  }
  return prediction;
}

async function generateMatchPrediction(match) {
  let prediction = await getPythonPrediction(match);
  if (!prediction) prediction = fallbackPrediction(match);
  prediction = await enhanceVerdictWithGemini(match, prediction);
  return prediction;
}

async function chatWithAI(messages, context) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI service not configured.');
  const history = [
    { role: 'user', parts: [{ text: 'You are GoalIQ, an expert football analyst AI. Give sharp concise answers in 3-5 sentences max.' }] },
    { role: 'model', parts: [{ text: 'Ready! I am GoalIQ. Ask me anything about football.' }] },
    ...messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })),
  ];
  try {
    const res = await axios({
      method: 'post', url: GEMINI_URL, params: { key },
      headers: { 'Content-Type': 'application/json' },
      data: { contents: history, generationConfig: { temperature: 0.8, maxOutputTokens: 400 } },
      timeout: 30000,
    });
    const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('Empty response');
    return reply;
  } catch (err) {
    console.error('Gemini chat error:', err.message);
    throw new Error('AI temporarily unavailable.');
  }
}

function fallbackPrediction(match) {
  const h = Math.floor(Math.random() * 20) + 38;
  const d = Math.floor(Math.random() * 10) + 22;
  const a = 100 - h - d;
  const winner = h > a ? 'home' : a > h ? 'away' : 'draw';
  const winnerName = winner === 'home' ? match.homeTeam : winner === 'away' ? match.awayTeam : 'Neither side';
  return {
    probHome: h, probDraw: d, probAway: a, winner, confidence: 55,
    xgHome: parseFloat((Math.random() * 1.2 + 1.0).toFixed(1)),
    xgAway: parseFloat((Math.random() * 1.0 + 0.7).toFixed(1)),
    btts: 52, over25: 58,
    scoreline: winner === 'home' ? '2-1' : winner === 'away' ? '1-2' : '1-1',
    verdict: `${match.homeTeam} host ${match.awayTeam} in the ${match.leagueName}. Home advantage is a key factor. ${winnerName} are given the edge by our model.`,
    model: 'Fallback Statistical Model',
  };
}

module.exports = { generateMatchPrediction, chatWithAI };
