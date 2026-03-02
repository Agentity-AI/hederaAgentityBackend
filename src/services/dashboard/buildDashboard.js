const { Op, fn, col } = require("sequelize");
const UserAgentEvent = require("../../models/userAgentEvent");
const Agent = require("../../models/agent");

function parseRiskScore(payload) {
  if (!payload) return null;
  if (typeof payload.riskScore === "number") return payload.riskScore;
  if (typeof payload.risk_score === "number") return payload.risk_score;
  return null;
}

function isVulnerability(payload) {
  const risk = parseRiskScore(payload);
  const status =
    typeof payload?.status === "string" ? payload.status.toLowerCase() : "";
  return (
    (typeof risk === "number" && risk >= 0.7) ||
    status.includes("denied") ||
    status.includes("vulnerable")
  );
}

function startOfDayUTC(d) {
  const x = new Date(d);
  return new Date(
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()),
  );
}

function dateLabel(d) {
  return startOfDayUTC(d).toISOString().slice(0, 10);
}

function lastNDaysLabels(n) {
  const today = startOfDayUTC(new Date());
  const labels = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    labels.push(dateLabel(d));
  }
  return labels;
}

async function buildDashboard(user, options = {}) {
  const userId = user.id;
  const email = user.email || null;
  const name =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    options.name ||
    "";

  const labels = lastNDaysLabels(7);
  const since7d = new Date(labels[0] + "T00:00:00.000Z");
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalVerifiedAgent,
    activeSimulation,
    transactionsExecuted,
    recentActivity,
    touchedAgentsDistinct,
    events7d,
    lastTouchedEvent,
  ] = await Promise.all([
    UserAgentEvent.count({
      where: { user_id: userId, action: "agent_verify" },
    }),
    UserAgentEvent.count({
      where: {
        user_id: userId,
        action: "agent_simulate",
        createdAt: { [Op.gte]: since24h },
      },
    }),
    UserAgentEvent.count({
      where: { user_id: userId, action: "agent_execute" },
    }),
    UserAgentEvent.findAll({
      where: { user_id: userId },
      order: [["createdAt", "DESC"]],
      limit: 20,
    }),
    UserAgentEvent.findAll({
      where: { user_id: userId, agent_id: { [Op.ne]: null } },
      attributes: [[fn("DISTINCT", col("agent_id")), "agent_id"]],
    }),
    UserAgentEvent.findAll({
      where: { user_id: userId, createdAt: { [Op.gte]: since7d } },
      attributes: ["action", "payload", "createdAt"],
      order: [["createdAt", "ASC"]],
    }),
    UserAgentEvent.findOne({
      where: { user_id: userId, agent_id: { [Op.ne]: null } },
      order: [["createdAt", "DESC"]],
    }),
  ]);

  const agentIds = touchedAgentsDistinct
    .map((r) => r.get("agent_id"))
    .filter(Boolean);
  const totalAgent = agentIds.length;

  let activeAgent = null;
  if (lastTouchedEvent?.agent_id) {
    activeAgent = await Agent.findByPk(lastTouchedEvent.agent_id, {
      attributes: [
        "id",
        "agent_name",
        "status",
        "fingerprint",
        "public_key",
        "blockchain_agent_id",
        "blockchain_tx_hash",
        "blockchain_registered_at",
        "blockchain_sync_status",
      ],
    });
  }

  const verificationSeries = Array(7).fill(0);
  const vulnerabilitySeries = Array(7).fill(0);

  let vulnerabilitiesDetected = 0;

  for (const ev of events7d) {
    const idx = labels.indexOf(dateLabel(ev.createdAt));
    if (idx === -1) continue;

    if (ev.action === "agent_verify") verificationSeries[idx] += 1;
    if (ev.action === "agent_simulate") {
      const vuln = isVulnerability(ev.payload);
      if (vuln) {
        vulnerabilitySeries[idx] += 1;
        vulnerabilitiesDetected += 1;
      }
    }
  }

  return {
    email,
    name,
    Totalagent: totalAgent,
    TotalvarifiedAgent: totalVerifiedAgent,
    activeSimulation,
    VulnerabilitiesDetected: vulnerabilitiesDetected,
    TransactionsExecuted: transactionsExecuted,
    chart: {
      labels,
      Verification: verificationSeries,
      Vulnerability: vulnerabilitySeries,
    },
    activeAgent,
    RecentActivity: recentActivity.map((e) => ({
      id: e.id,
      action: e.action,
      agent_id: e.agent_id,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
  };
}

module.exports = { buildDashboard };
