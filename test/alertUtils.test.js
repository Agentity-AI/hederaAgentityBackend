const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSimulationAlert,
  maxSeverity,
  worstRiskLevel,
} = require("../src/services/alerts/alertUtils");

test("worstRiskLevel returns the highest risk level in a list", () => {
  assert.equal(worstRiskLevel(["low", "medium", "high"]), "high");
  assert.equal(worstRiskLevel(["low", "critical"]), "critical");
});

test("maxSeverity returns the most severe alert level", () => {
  assert.equal(maxSeverity(["low", "medium", "critical"]), "critical");
});

test("buildSimulationAlert returns null for safe simulations", () => {
  assert.equal(buildSimulationAlert({ riskScore: 20, vulnerabilitiesCount: 0 }), null);
});

test("buildSimulationAlert returns high severity for risky simulations", () => {
  const alert = buildSimulationAlert({ riskScore: 70, vulnerabilitiesCount: 1 });

  assert.equal(alert.severity, "high");
  assert.equal(alert.type, "simulation_risk");
});
