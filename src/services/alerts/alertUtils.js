const SEVERITY_ORDER = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

const RISK_LEVEL_ORDER = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

function normalizeSeverity(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SEVERITY_ORDER[normalized] ? normalized : "medium";
}

function maxSeverity(values = []) {
  let current = "low";

  for (const value of values) {
    const normalized = normalizeSeverity(value);
    if (SEVERITY_ORDER[normalized] > SEVERITY_ORDER[current]) {
      current = normalized;
    }
  }

  return current;
}

function worstRiskLevel(values = []) {
  let current = "low";

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    const safeValue = RISK_LEVEL_ORDER[normalized] ? normalized : "low";

    if (RISK_LEVEL_ORDER[safeValue] > RISK_LEVEL_ORDER[current]) {
      current = safeValue;
    }
  }

  return current;
}

function buildSimulationAlert({ riskScore = 0, vulnerabilitiesCount = 0 } = {}) {
  if (riskScore >= 85 || vulnerabilitiesCount >= 3) {
    return {
      severity: "critical",
      type: "simulation_risk",
      title: "Critical simulation risk detected",
      message: "Simulation produced a critical risk score or multiple vulnerabilities.",
    };
  }

  if (riskScore >= 60 || vulnerabilitiesCount >= 1) {
    return {
      severity: "high",
      type: "simulation_risk",
      title: "High-risk simulation detected",
      message: "Simulation produced elevated risk and should be reviewed before execution.",
    };
  }

  return null;
}

module.exports = {
  buildSimulationAlert,
  maxSeverity,
  normalizeSeverity,
  worstRiskLevel,
};
