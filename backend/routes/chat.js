const express = require('express');
const { chatWithAI } = require('../services/aiService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/chat
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'messages array is required.' });

    // Validate message format
    const cleaned = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 2000),
    }));

    const reply = await chatWithAI(cleaned, context);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
