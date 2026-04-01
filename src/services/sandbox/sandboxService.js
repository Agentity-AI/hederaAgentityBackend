const Agent = require("../../models/agent");
const AgentBehaviorLog = require("../../models/agentBehaviorLog");
const { runSandbox } = require("./dockerRunner");

async function simulateAgent(agentId) {
  const agent = await Agent.findByPk(agentId);

  if (!agent) {
    throw new Error("Agent not found");
  }

  if (agent.status !== "verified") {
    throw new Error("Agent must be verified before simulation");
  }

  const result = await runSandbox(agentId);

  await AgentBehaviorLog.create({
    agent_id: agent.id,
    event_type: "simulation",
    event_payload: result,
    risk_score: result.riskScore,
  });

  return result;
}

module.exports = { simulateAgent };
