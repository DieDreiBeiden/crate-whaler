// Rechnet im Hintergrund, damit die Seite beim Tippen nicht ruckelt.
importScripts("santa2026.js", "sim.js");

const JOBS = { plan: runPlan, needs: runNeeds, milestones: runMilestones, pitytable: runPityTable };

self.onmessage = (e) => {
  const { id, kind, params } = e.data;
  self.postMessage({ id, result: JOBS[kind](params) });
};
