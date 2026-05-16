const axios = require('axios');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

/**
 * Generate an AI prediction for a given match using Anthropic Claude.
 * Returns structured prediction data.
 */
async function generateMatchPrediction(match) {
  const systemPrompt = `You are GoalIQ, an expert football data analyst and prediction engine.
You analyze matches using form, stats, head-to-head records, and tactical factors.
You MUST respond with ONLY a valid JSON object — no markdown, no preamble, no explanation outside the JSON.`;

  const userPrompt = `Analyze this football match and return a prediction JSON:

Match: ${match.homeTeam} vs ${match.awayTeam}
League: ${match.leagueName}
Kickoff: ${match.kickoff}
Home form (last 5): ${match.stats?.homeForm || 'Unknown'}
Away form (last 5): ${match.stats?.awayForm || 'Unknown'}
Home goals avg: ${match.stats?.homeGoalsAvg || 'Unknown'}
Away goals avg: ${match.stats?.awayGoalsAvg || 'Unknown'}
Home odds: ${match.odds?.home || 'N/A'}
Draw odds: ${match.odds?.draw || 'N/A'}
Away odds: ${match.odds?.away || 'N/A'}
H2H summary: ${match.stats?.h2h || 'No recent H2H data'}

Return ONLY this JSON structure (all number fields are integers or floats, no strings):
{
  "probHome": <0-100 integer>,
  "probDraw": <0-100 integer>,
  "probAway": <0-100 integer>,
  "winner": "<home|draw|away>",
  "confidence": <0-100 integer>,
  "xgHome": <float>,
  "xgAway": <float>,
  "btts": <0-100 integer>,
  "over25": <0-100 integer>,
  "scoreline": "<predicted scoreline e.g. 2-1>",
  "verdict": "<2-4 sentence analytical verdict explaining your prediction>"
}`;

  try {
    const response = await axios.post(
      ANTHROPIC_API,
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    const raw = response.data.content[0].text.trim();
    // Strip possible ```json fences
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Normalize probabilities to sum to 100
    const total = parsed.probHome + parsed.probDraw + parsed.probAway;
    if (total !== 100) {
      const factor = 100 / total;
      parsed.probHome = Math.round(parsed.probHome * factor);
      parsed.probDraw = Math.round(parsed.probDraw * factor);
      parsed.probAway = 100 - parsed.probHome - parsed.probDraw;
    }

    return parsed;
  } catch (err) {
    console.error('AI prediction error:', err.response?.data || err.message);
    // Fallback: generate reasonable prediction from odds
    return fallbackPrediction(match);
  }
}

/**
 * Generate a chat response from the AI football assistant.
 */
async function chatWithAI(messages, context = '') {
  const systemPrompt = `You are GoalIQ, a world-class football analyst AI. 
You provide sharp, data-driven insights on match predictions, team form, player performance, tactics, and transfer news.
Keep responses concise and engaging (3-5 sentences max unless asked for detail).
Be confident but honest about uncertainty.
${context ? `Current context: ${context}` : ''}`;

  try {
    const response = await axios.post(
      ANTHROPIC_API,
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }
    );
    return response.data.content[0].text;
  } catch (err) {
    console.error('AI chat error:', err.response?.data || err.message);
    throw new Error('AI service temporarily unavailable.');
  }
}

/**
 * Fallback prediction based on odds when AI is unavailable.
 */
function fallbackPrediction(match) {
  const odds = match.odds || { home: 2.5, draw: 3.2, away: 3.0 };
  // Convert odds to implied probability
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
    probHome, probDraw, probAway,
    winner,
    confidence: 55,
    xgHome: parseFloat((Math.random() * 1.5 + 0.8).toFixed(1)),
    xgAway: parseFloat((Math.random() * 1.2 + 0.6).toFixed(1)),
    btts: 50,
    over25: 55,
    scoreline: winner === 'home' ? '2-1' : winner === 'away' ? '1-2' : '1-1',
    verdict: `Prediction based on current market odds. ${match.homeTeam} are slight favourites at home.`,
  };
}

module.exports = { generateMatchPrediction, chatWithAI };
