require("dotenv").config();

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:5000";
const HEDERA_CONFIGURED = Boolean(
  process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY,
);
const SMOKE_WALLET_CONFIGURED = Boolean(
  process.env.SMOKE_HEDERA_ACCOUNT_ID && process.env.SMOKE_HEDERA_PUBLIC_KEY,
);

function createRunner() {
  let authToken = null;

  async function request(method, path, body, options = {}) {
    const headers = {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  }

  return {
    async step(label, method, path, body, options) {
      process.stdout.write(`\n[SMOKE] ${label}\n`);
      const result = await request(method, path, body, options);

      if (!result.ok) {
        const conflictMessage =
          result.status === 409 && path === "/wallets/link"
            ? "\n[SMOKE] Wallet conflict detected. Run `npm run smoke:wallet:inspect` to inspect the current owner, or release a stale smoke link with `SMOKE_RELEASE_CONFIRM=YES_RELEASE_SMOKE_WALLET npm run smoke:wallet:release`."
            : "";
        throw new Error(
          `${label} failed (${result.status}): ${JSON.stringify(result.payload)}${conflictMessage}`,
        );
      }

      console.log(`[OK] ${method} ${path} -> ${result.status}`);
      return result.payload;
    },
    setAuthToken(token) {
      authToken = token;
    },
  };
}

function makeAuditSource() {
  return `pragma solidity ^0.8.0;

contract SmokeVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        require(tx.origin == msg.sender, "bad auth");
        (bool ok,) = msg.sender.call{value: balances[msg.sender]}("");
        require(ok, "transfer failed");
        balances[msg.sender] = 0;
    }
}`;
}

async function main() {
  const runner = createRunner();
  const nonce = Date.now();
  const email = process.env.SMOKE_EMAIL || `smoke.${nonce}@example.com`;
  const password =
    process.env.SMOKE_PASSWORD || `SmokeTest!${String(nonce).slice(-6)}`;
  const name = process.env.SMOKE_NAME || `Smoke Tester ${String(nonce).slice(-4)}`;
  const walletDetails = SMOKE_WALLET_CONFIGURED
    ? {
        hederaAccountId: process.env.SMOKE_HEDERA_ACCOUNT_ID,
        hederaPublicKey: process.env.SMOKE_HEDERA_PUBLIC_KEY,
        kmsKeyId: process.env.SMOKE_KMS_KEY_ID || process.env.AWS_KMS_KEY_ID || null,
      }
    : !HEDERA_CONFIGURED
      ? {
          hederaAccountId: "0.0.5001",
          hederaPublicKey: "smoke-public-key",
          kmsKeyId: null,
        }
      : null;

  console.log("[SMOKE] Backend smoke test starting");
  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        hederaConfigured: HEDERA_CONFIGURED,
        smokeWalletConfigured: SMOKE_WALLET_CONFIGURED,
        creConfigured: Boolean(process.env.CRE_WEBHOOK_URL),
        kmsConfigured: Boolean(process.env.AWS_REGION && process.env.AWS_KMS_KEY_ID),
      },
      null,
      2,
    ),
  );

  const health = await runner.step("Health check", "GET", "/health");
  const system = await runner.step("System status", "GET", "/system/status");

  if (health.status !== "healthy") {
    throw new Error("Health endpoint did not return healthy status");
  }

  if (system.database !== "connected") {
    throw new Error("System status did not report a connected database");
  }

  let authPayload;

  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    try {
      authPayload = await runner.step("Login smoke user", "POST", "/auth/login", {
        email,
        password,
      });
    } catch (loginError) {
      console.log(
        "[SMOKE] Existing smoke user login failed, attempting first-time registration with the configured credentials.",
      );
      authPayload = await runner.step("Register smoke user", "POST", "/auth/register", {
        email,
        password,
        name,
      });
    }
  } else {
    authPayload = await runner.step("Register auth user", "POST", "/auth/register", {
      email,
      password,
      name,
    });
  }

  runner.setAuthToken(authPayload.jwt);

  await runner.step("Fetch dashboard overview", "GET", "/dashboard/overview");

  const agent = await runner.step("Register agent", "POST", "/agents/register", {
    agentName: `Smoke Agent ${String(nonce).slice(-4)}`,
    publicKey: `0xsmoke${nonce}`,
    description: "Automated backend smoke test agent",
    agentType: "workflow-test-agent",
  });

  if (walletDetails) {
    await runner.step("Link agent wallet", "POST", "/wallets/link", {
      agentId: agent.id,
      hederaAccountId: walletDetails.hederaAccountId,
      hederaPublicKey: walletDetails.hederaPublicKey,
      kmsKeyId: walletDetails.kmsKeyId,
    });
  } else {
    console.log(
      "[SKIP] Wallet, payment, and execution checks skipped. Set SMOKE_HEDERA_ACCOUNT_ID and SMOKE_HEDERA_PUBLIC_KEY to test the live Hedera flow.",
    );
  }

  await runner.step("Verify agent", "POST", `/agents/${agent.id}/verify`, walletDetails
    ? {
        hederaAccountId: walletDetails.hederaAccountId,
        hederaPublicKey: walletDetails.hederaPublicKey,
        kmsKeyId: walletDetails.kmsKeyId,
      }
    : {});

  await runner.step("List my agents", "GET", "/agents/my");
  await runner.step("Fetch workflow summary", "GET", "/workflow/summary");

  const audit = await runner.step("Create smart contract audit", "POST", "/audits", {
    contractName: "SmokeVault",
    sourceType: "paste",
    sourceCode: makeAuditSource(),
  });

  await runner.step("Fetch audit history", "GET", "/audits/history");
  await runner.step("Fetch audit details", "GET", `/audits/${audit.id}`);
  await runner.step("Fetch alert list", "GET", "/alerts");
  await runner.step("Fetch alert summary", "GET", "/alerts/summary");

  const task = await runner.step("Create task request", "POST", "/tasks/request", {
    agentId: agent.id,
    taskType: "execution",
    inputPayload: {
      target: "swap",
      amount: 1,
      network: process.env.HEDERA_NETWORK || "testnet",
    },
  });

  await runner.step("Simulate task", "POST", `/tasks/${task.id}/simulate`);
  await runner.step("Fetch task history", "GET", "/tasks/history");
  await runner.step("Fetch payment history", "GET", "/payments/history");

  let payment = null;
  let execution = null;

  if (walletDetails) {
    payment = await runner.step("Pay task", "POST", `/tasks/${task.id}/pay`);
    execution = await runner.step("Execute task", "POST", `/tasks/${task.id}/execute`);
  }

  const policy = await runner.step("Create transaction policy", "POST", "/transactions/policies", {
    name: `Smoke Policy ${String(nonce).slice(-4)}`,
    description: "Generated during backend smoke testing",
    rules: {
      maxAmount: 10,
      allowedTypes: ["payment", "execution"],
    },
    status: "active",
  });

  await runner.step("Fetch transaction policies", "GET", "/transactions/policies");
  const transactions = await runner.step("Fetch transaction history", "GET", "/transactions/history");

  if (transactions.items && transactions.items.length > 0) {
    await runner.step(
      "Fetch transaction details",
      "GET",
      `/transactions/${transactions.items[0].id}`,
    );
  }

  console.log("\n[SMOKE] Completed successfully");
  console.log(
    JSON.stringify(
      {
        createdUser: email,
        createdAgentId: agent.id,
        createdAuditId: audit.id,
        createdTaskId: task.id,
        createdPolicyId: policy.id,
        livePaymentAndExecutionTested: Boolean(walletDetails),
        hederaPaymentSimulated: payment?.simulated ?? null,
        creFallbackUsed: execution?.execution?.fallback ?? null,
        kmsSignatureSimulated: execution?.kms?.simulated ?? null,
        kmsAuditId: execution?.kms?.auditId ?? null,
      },
      null,
      2,
    ),
  );

  if (!walletDetails) {
    console.log(
      "\n[SMOKE] To test live Hedera payment and execution next, add these env vars and rerun `npm run smoke`:\n- SMOKE_HEDERA_ACCOUNT_ID\n- SMOKE_HEDERA_PUBLIC_KEY\n- optionally SMOKE_KMS_KEY_ID",
    );
  }
}

main().catch((error) => {
  console.error("\n[SMOKE] Failed");
  console.error(error.message);
  process.exit(1);
});
