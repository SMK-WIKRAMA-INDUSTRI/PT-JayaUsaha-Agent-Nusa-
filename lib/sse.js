// Parser stream SSE format OpenAI (dipakai Netra). Dipakai /api/chat (server) dan lib/api.js (browser).
// push(teks) mengembalikan daftar event: { text } | { usage } | { error } | { done } | { toolCall } | { nusa }.
// nusa: event dari server kita sendiri (baris yang disisipkan server di tengah giliran), bukan dari Netra.

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
        if (j.nusa) {
          events.push({ nusa: j.nusa });
          continue;
        }
        const d = j.choices && j.choices[0] && j.choices[0].delta;
        if (d && typeof d.content === 'string' && d.content) events.push({ text: d.content });
        if (d && Array.isArray(d.tool_calls)) {
          for (const tc of d.tool_calls) {
            const f = tc.function || {};
            events.push({ toolCall: { index: tc.index ?? 0, id: tc.id || '', name: f.name || '', arguments: f.arguments || '' } });
          }
        }
        if (j.usage) events.push({ usage: j.usage });
      }
      return events;
    }
  };
}

// Merakit potongan tool_calls dari stream menjadi panggilan utuh: [{ id, name, arguments }].
export function createToolCallCollector() {
  const slots = [];
  return {
    push(tc) {
      const s = (slots[tc.index] ||= { id: '', name: '', arguments: '' });
      if (tc.id) s.id = tc.id;
      if (tc.name) s.name += tc.name;
      if (tc.arguments) s.arguments += tc.arguments;
    },
    list() {
      return slots.filter((s) => s && s.name);
    }
  };
}
