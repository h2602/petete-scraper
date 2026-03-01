import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

// GET /detail?doc=64762&tab=2&num=V1885-24
app.get("/detail", async (req, res) => {
  const doc = req.query.doc;
  const tab = req.query.tab ?? "2";
  const num = req.query.num;

  if (!doc || !num) {
    return res.status(400).json({ error: "Missing doc or num" });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1) Crear sesión
    await page.goto("https://petete.tributos.hacienda.gob.es/consultas/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // 2) Abrir detalle
    const url =
      "https://petete.tributos.hacienda.gob.es/consultas/do/document?query=" +
      encodeURIComponent(`+.EN+NUM-CONSULTA+(${num})`) +
      `&doc=${encodeURIComponent(doc)}` +
      `&tab=${encodeURIComponent(tab)}`;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const html = await page.content();
    res.status(200).json({ doc: Number(doc), tab: Number(tab), num, html });

  } catch (e) {
    res.status(500).json({ error: String(e) });
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
});

const port = process.env.PORT || 10000;

app.listen(port, "0.0.0.0", () => {
  console.log(`petete-scraper listening on ${port}`);
});
