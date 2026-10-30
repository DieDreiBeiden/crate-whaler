// Rechnet im Hintergrund, damit die Seite beim Tippen nicht ruckelt.
// Versionsnummer aus index.html weiterreichen, damit kein alter Stand aus dem Cache kommt
importScripts("santa2026.js" + self.location.search, "sim.js" + self.location.search);

const JOBS = { plan: runPlan, needs: runNeeds, milestones: runMilestones, pitytable: runPityTable };

self.onmessage = (e) => {
  const { id, kind, params } = e.data;
  self.postMessage({ id, result: JOBS[kind](params) });
};
