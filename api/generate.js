const STYLES = {
  akademik: "Bahasa Indonesia baku, gaya akademik untuk tugas kuliah, poin jelas dan berbobot.",
  ringkas: "Bahasa Indonesia, sangat ringkas, tiap poin maksimal 10 kata.",
  persuasif: "Bahasa Indonesia, gaya persuasif dan meyakinkan untuk pitch atau kampanye.",
};

async function askGemini(prompt, key) {
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!r.ok) throw new Error("Gemini " + r.status);
  const data = await r.json();
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

async function askClaude(prompt, key) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error("Claude " + r.status);
  const data = await r.json();
  return (data.content || []).map((c) => c.text || "").join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST" });

  const gKey = process.env.GEMINI_API_KEY;
  const aKey = process.env.ANTHROPIC_API_KEY;
  if (!gKey && !aKey) {
    return res.status(500).json({ error: "Belum ada GEMINI_API_KEY atau ANTHROPIC_API_KEY" });
  }

  const { topic, count = 8, style = "akademik" } = req.body || {};
  if (!topic || typeof topic !== "string" || topic.length > 300) {
    return res.status(400).json({ error: "Topik kosong atau terlalu panjang (maks 300 karakter)" });
  }
  const n = Math.min(15, Math.max(4, parseInt(count, 10) || 8));

  const prompt = `Buat isi presentasi tentang: "${topic}".
Gaya: ${STYLES[style] || STYLES.akademik}
Jumlah slide isi (di luar slide judul): ${n - 1}.
Tiap slide: judul pendek, 3 sampai 5 poin, dan catatan pembicara 1-2 kalimat.
Jangan mengarang kutipan, angka, atau referensi.
Balas HANYA JSON valid tanpa teks lain, dengan bentuk:
{"title":"...","slides":[{"title":"...","bullets":["..."],"notes":"..."}]}`;

  try {
    const text = gKey ? await askGemini(prompt, gKey) : await askClaude(prompt, aKey);
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!json.title || !Array.isArray(json.slides)) throw new Error("format");
    return res.status(200).json(json);
  } catch (e) {
    return res.status(500).json({ error: "Gagal membuat slide: " + e.message });
  }
}
