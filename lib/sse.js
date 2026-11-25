// Parser stream SSE format OpenAI (dipakai Netra). Dipakai /api/chat (server) dan lib/api.js (browser).
// push(teks) mengembalikan daftar event: { text } | { usage } | { error } | { done }.

export function createSseParser() {
  let buf = '';
  return {
    push(chunk) {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      const events = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          events.push({ done: true });
          continue;
        }
        let j;
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.error) {
          events.push({ error: j.error.message || 'Error dari server' });
          continue;
        }
        const d = j.choices && j.choices[0] && j.choices[0].delta;
        if (d && typeof d.content === 'string' && d.content) events.push({ text: d.content });
        if (j.usage) events.push({ usage: j.usage });
      }
      return events;
    }
  };
}
