#!/usr/bin/env node
// Renders the Obsidian-style brain graph for one question to a PNG, so it can be shown inline in chat.
// usage: node scripts/brain-snapshot.cjs <data.json> <out.png>
// data.json: { question, nodes: [{id,label,type,hit,snippet}], edges: [{s,t,kind}] }  (kind "hit" = question->page, "link" = page->page)
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const [dataPath, outPath] = process.argv.slice(2);
if (!dataPath || !outPath) { console.error("usage: brain-snapshot.cjs <data.json> <out.png>"); process.exit(2); }
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const tpl = fs.readFileSync(path.join(__dirname, "..", "brain-graph", "index.html"), "utf8");
const html = tpl.replace(/(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/,
  (_, a, b) => a + "\n" + JSON.stringify(data).replace(/</g, "\\u003c") + "\n" + b);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 }, deviceScaleFactor: 2 });
  await page.setContent("<!doctype html><html><body>" + html + "</body></html>", { waitUntil: "load" });
  await page.addStyleTag({ content: ".stage{grid-template-columns:1fr!important} aside{display:none!important}" });
  await page.evaluate(() => window.dispatchEvent(new Event("resize"))); // re-measure the canvas after the layout change
  await page.waitForTimeout(4200); // force layout settles, then the page auto-fits the view
  await page.screenshot({ path: outPath });
  await browser.close();
  console.log("wrote " + outPath);
})();
