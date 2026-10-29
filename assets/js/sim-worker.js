// Rechnet die Simulation im Hintergrund, damit die Seite beim Tippen nicht ruckelt.
importScripts("santa2026.js", "sim.js");

self.onmessage = (e) => {
  const { id, params } = e.data;
  self.postMessage({ id, result: runPlan(params) });
};
