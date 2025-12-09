export default async function handler(req, res) {
  try {
    const { crypto, fiat } = req.query;

    if (!crypto || !fiat) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const apiKey = process.env.COINGECKO_API_KEY;

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${crypto}&vs_currencies=${fiat}`;

    const response = await fetch(url, {
      headers: {
        "x-cg-api-key": apiKey,
        Accept: "application/json"
      }
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: "API error", detail: error.message });
  }
}
