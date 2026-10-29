// Rechnet im Hintergrund, damit die Seite beim Tippen nicht ruckelt.
// kind "plan": Ergebnis eines Container-Plans, kind "needs": benötigte Container je Stufe.
importScripts("santa2026.js", "sim.js");

self.onmessage = (e) => {
  const { id, kind, params } = e.data;
  self.postMessage({ id, result: kind === "needs" ? runNeeds(params) : runPlan(params) });
};
