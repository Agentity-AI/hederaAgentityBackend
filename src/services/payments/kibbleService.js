const KIBBLE_BASE_URL = "https://kibble.sh/pay";

function isLikelyEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function toOptionalString(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function toOptionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveKibbleParams({
  agent,
  toChain,
  toToken,
  toAddress,
  toAmount,
  minAmountUSD,
  agentName,
  agentLogo,
}) {
  const resolvedToChain =
    toOptionalNumber(toChain) ??
    toOptionalNumber(process.env.KIBBLE_DEFAULT_TO_CHAIN);
  const resolvedToToken =
    toOptionalString(toToken) ??
    toOptionalString(process.env.KIBBLE_DEFAULT_TO_TOKEN);
  const resolvedToAddress = toOptionalString(toAddress) ?? agent.public_key;
  const resolvedAgentName =
    toOptionalString(agentName) ??
    toOptionalString(agent?.agent_name) ??
    "Agentity Agent";
  const resolvedAgentLogo =
    toOptionalString(agentLogo) ??
    toOptionalString(process.env.KIBBLE_DEFAULT_AGENT_LOGO);
  const resolvedToAmount = toOptionalString(toAmount);
  const resolvedMinAmountUSD = toOptionalNumber(minAmountUSD);

  if (!resolvedToChain) {
    throw new Error("toChain is required. Pass it explicitly or set KIBBLE_DEFAULT_TO_CHAIN.");
  }

  if (!resolvedToToken) {
    throw new Error("toToken is required. Pass it explicitly or set KIBBLE_DEFAULT_TO_TOKEN.");
  }

  if (!resolvedToAddress) {
    throw new Error("toAddress is required. Pass it explicitly or register the agent with a destination wallet address.");
  }

  if (!isLikelyEvmAddress(resolvedToAddress)) {
    throw new Error(
      "Kibble currently expects an EVM-compatible destination wallet address. Provide a valid 0x wallet in toAddress.",
    );
  }

  return {
    toChain: resolvedToChain,
    toToken: resolvedToToken,
    toAddress: resolvedToAddress,
    toAmount: resolvedToAmount,
    agentName: resolvedAgentName,
    agentLogo: resolvedAgentLogo,
    minAmountUSD: resolvedMinAmountUSD,
  };
}

function buildKibblePaymentLink(params) {
  const query = new URLSearchParams();

  query.set("toChain", String(params.toChain));
  query.set("toToken", params.toToken);
  query.set("toAddress", params.toAddress);

  if (params.toAmount != null) {
    query.set("toAmount", String(params.toAmount));
  }

  if (params.agentName) {
    query.set("agentName", params.agentName);
  }

  if (params.agentLogo) {
    query.set("agentLogo", params.agentLogo);
  }

  if (params.minAmountUSD != null) {
    query.set("minAmountUSD", String(params.minAmountUSD));
  }

  return `${KIBBLE_BASE_URL}?${query.toString()}`;
}

module.exports = {
  buildKibblePaymentLink,
  isLikelyEvmAddress,
  resolveKibbleParams,
};
