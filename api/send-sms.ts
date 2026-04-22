export default async function handler(req, res) {
  try {
    const { number, message } = req.body;

    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        route: "q",
        message: message,
        language: "english",
        numbers: number
      })
    });

    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "SMS failed" });
  }
}
