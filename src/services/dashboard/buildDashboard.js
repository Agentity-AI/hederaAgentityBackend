const { Op } = require("sequelize");
const UserAgentEvent = require("../../models/userAgentEvent");
const Agent = require("../../models/agent");
const AgentReputation = require("../../models/agentReputation");
const Alert = require("../../models/alert");
const { maxSeverity, worstRiskLevel } = require("../alerts/alertUtils");

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
  const since7d = new Date(`${labels[0]}T00:00:00.000Z`);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalAgent,
    totalVerifiedAgent,
    activeSimulation,
    transactionsExecuted,
    reputations,
    alerts,
    recentActivity,
    events7d,
    lastTouchedEvent,
  ] = await Promise.all([
    Agent.count({
      where: { creator_id: userId },
    }),

    Agent.count({
      where: { creator_id: userId, status: "verified" },
    }),

    UserAgentEvent.count({
      where: {
        user_id: userId,
        action: "agent_simulate",
        created_at: { [Op.gte]: since24h },
      },
    }),

    UserAgentEvent.count({
      where: {
        user_id: userId,
        action: "agent_execute",
      },
    }),

    AgentReputation.findAll({
      include: [
        {
          model: Agent,
          required: true,
          attributes: [],
          where: { creator_id: userId },
        },
      ],
      order: [["updatedAt", "DESC"]],
    }),

    Alert.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: 10,
    }),

    UserAgentEvent.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: 20,
    }),

    UserAgentEvent.findAll({
      where: {
        user_id: userId,
        created_at: { [Op.gte]: since7d },
      },
      attributes: ["action", "payload", "created_at"],
      order: [["created_at", "ASC"]],
    }),

    UserAgentEvent.findOne({
      where: {
        user_id: userId,
        agent_id: { [Op.ne]: null },
      },
      order: [["created_at", "DESC"]],
    }),
  ]);

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
  const trustScores = reputations.map((reputation) => Number(reputation.score || 0));
  const trustScore =
    trustScores.length > 0
      ? Number(
          (trustScores.reduce((sum, value) => sum + value, 0) / trustScores.length).toFixed(2),
        )
      : 0;
  const riskLevel = worstRiskLevel(reputations.map((reputation) => reputation.risk_level));

  for (const ev of events7d) {
    const idx = labels.indexOf(dateLabel(ev.created_at));
    if (idx === -1) continue;

    if (ev.action === "agent_verify") {
      verificationSeries[idx] += 1;
    }

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
    trustScore,
    riskLevel,
    alertSeverity: maxSeverity(alerts.map((alert) => alert.severity)),
    chart: {
      labels,
      Verification: verificationSeries,
      Vulnerability: vulnerabilitySeries,
    },
    activeAgent,
    recentAlerts: alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      type: alert.type,
      status: alert.status,
      message: alert.message,
      createdAt: alert.created_at,
    })),
    RecentActivity: recentActivity.map((e) => ({
      id: e.id,
      action: e.action,
      agent_id: e.agent_id,
      payload: e.payload,
      createdAt: e.created_at,
    })),
  };
}

module.exports = { buildDashboard };
