import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/detail", async (req, res) => {
  const doc = String(req.query.doc || "");
  const tab = String(req.query.tab || "2");
  const num = String(req.query.num || "");

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
        "--no-zygote",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "es-ES"
    });

    const page = await context.newPage();
    await page.setExtraHTTPHeaders({
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    });

    // 1) Home
    await page.goto("https://petete.tributos.hacienda.gob.es/consultas/", {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    // 2) Search por NUM-CONSULTA (esto crea contexto y carga JS del site)
    const searchUrl =
      "https://petete.tributos.hacienda.gob.es/consultas/do/search" +
      "?type1=on&type2=on" +
      "&NMCMP_1=NUM-CONSULTA" +
      `&VLCMP_1=${encodeURIComponent(num)}` +
      "&OPCMP_1=.Y" +
      "&cmpOrder=NUM-CONSULTA&dirOrder=0" +
      `&tab=${encodeURIComponent(tab)}` +
      "&page=1";

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });

    // Esperar a que exista el resultado
    const selector = `#doc_${doc}`;
    await page.waitForSelector(selector, { timeout: 30000 });

    // 3) Esperar a que cargue la función viewDocument (no siempre está en window al principio)
    await page.waitForFunction(
      () => typeof viewDocument === "function",
      { timeout: 30000 }
    );

    // 4) Capturar la respuesta REAL que devuelve el servidor al pedir el documento
    // Puede ser navegación o XHR; por eso esperamos response.
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/consultas/do/document"),
      { timeout: 90000 }
    );

    // Disparar el mismo flujo que el onclick (pero sin depender del click)
    await page.evaluate(
      ({ d, t }) => viewDocument(Number(d), Number(t)),
      { d: doc, t: tab }
    );

    const resp = await responsePromise;
    const status = resp.status();
    const respUrl = resp.url();
    const body = await resp.text();

    // Por si el sitio actualiza el DOM con AJAX: cogemos también el HTML visible final
    // (a veces el body de la respuesta es parcial y el DOM final está completo)
    await page.waitForTimeout(300); // pequeño margen
    const htmlAfter = await page.content();

    return res.status(200).json({
      doc: Number(doc),
      tab: Number(tab),
      num,
      documentRequest: { status, url: respUrl },
      // body real que devuelve /do/document
      documentBody: body,
      // html actual de la página tras ejecutar viewDocument()
      pageHtml: htmlAfter
    });
  } catch (error) {
    console.error("SCRAPER ERROR:", error);
    return res.status(500).json({ error: String(error) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

const port = process.env.PORT || 10000;
app.listen(port, "0.0.0.0", () => {
  console.log(`petete-scraper listening on ${port}`);
});
