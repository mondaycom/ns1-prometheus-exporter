require('dotenv').config();
const express = require('express');
const NS1Exporter = require('./exporter');

async function main() {
  const zones = process.env.MONITOR_ZONES ? process.env.MONITOR_ZONES.split(',') : null;
  const exporter = new NS1Exporter(process.env.NS1_API_KEY, zones, process.env.EXPORTER_GRANULARITY);
  await exporter.initExporter();

  const app = express();
  app.get('/metrics', async (req, res) => {
    const promMetrics = await exporter.metrics();
    res.set("content-type", "text/plain; version=0.0.4");
    res.status(200).send(promMetrics);
  });

  app.listen(process.env.SERVER_PORT);
}

main();