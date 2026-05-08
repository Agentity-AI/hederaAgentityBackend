import {
  CronCapability,
  handler,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";

type Config = {
  schedule: string;
  contractAddress?: string;
  network?: string;
};

type InputPayload = {
  agentId: string;
  fingerprint: string;
  riskScore: number;
};

const onCronTrigger = async (runtime: Runtime<Config>) => {
  const config = runtime.config;

  const input: InputPayload = {
    agentId: "simulated-agent",
    fingerprint: "simulated-fingerprint",
    riskScore: 0.4,
  };

  const contractAddress = config?.contractAddress || "not-configured";
  const network = config?.network || "unknown-network";

  runtime.log("Simulated execution triggered", {
    input,
    contractAddress,
    network,
  });

  if (input.riskScore >= 0.7) {
    return {
      status: "denied",
      reason: "Risk score too high",
      agentId: input.agentId,
      fingerprint: input.fingerprint,
      contractAddress,
      network,
      evaluatedAt: new Date().toISOString(),
    };
  }

  return {
    status: "executed",
    agentId: input.agentId,
    fingerprint: input.fingerprint,
    contractAddress,
    network,
    executedAt: new Date().toISOString(),
  };
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [
    handler(
      cron.trigger({
        schedule: config.schedule,
      }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}