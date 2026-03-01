import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

/* ============================= */
/*            HEALTH             */
/* ============================= */

app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

/* ============================= */
/*          DETAIL SCRAPER       */
/* ============================= */

app.get("/detail", async (req, res) => {
  const doc = req.query.doc;
  const tab = req.query.tab ?? "2";
  const num = req.query.num;

  if (!doc || !num) {
    return res.status(400).json({ error: "Missing doc or num" });
  }

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote"
      ]
    });

    const page = await browser.newPage();

    // 1️⃣ Crear sesión inicial
    await page.goto(
      "https://petete.tributos.hacienda.gob.es/consultas/",
      {
        waitUntil: "domcontentloaded",
        timeout: 90000
      }
    );

    // 2️⃣ Construir URL del detalle
    const url =
      "https://petete.tributos.hacienda.gob.es/consultas/do/document?query=" +
      encodeURIComponent(`+.EN+NUM-CONSULTA+(${num})`) +
      `&doc=${encodeURIComponent(doc)}` +
      `&tab=${encodeURIComponent(tab)}`;

    // 3️⃣ Ir al detalle
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    const html = await page.content();

    res.status(200).json({
      doc: Number(doc),
      tab: Number(tab),
      num,
      html
    });

  } catch (error) {
    console.error("SCRAPER ERROR:", error);
    res.status(500).json({
      error: String(error)
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

/* ============================= */
/*            SERVER             */
/* ============================= */

const port = process.env.PORT || 10000;

app.listen(port, "0.0.0.0", () => {
  console.log(`petete-scraper listening on ${port}`);
});
