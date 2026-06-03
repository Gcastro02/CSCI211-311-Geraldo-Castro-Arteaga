import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

app.use(express.json());

app.post('/api/openai', async (req, res) => {
  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OpenAI API key not configured on server. Set OPENAI_API_KEY in .env.' });
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        ...req.body,
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(502).json({ error: 'Failed to reach OpenAI API.' });
  }
});

app.listen(PORT, () => {
  console.log(`[proxy] OpenAI proxy running on http://localhost:${PORT}`);
});
