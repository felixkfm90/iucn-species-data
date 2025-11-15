import fetch from "node-fetch";

export default async function handler(req, res) {
  const species = req.query.species;
  if (!species) return res.status(400).json({ error: "Missing species" });

  const apiToken = process.env.IUCN_TOKEN; // Token in Vercel Secrets speichern

  try {
    const response = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${species}?token=${apiToken}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "IUCN API request failed" });
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
