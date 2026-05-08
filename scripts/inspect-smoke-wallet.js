require("dotenv").config();

const { Client } = require("pg");

async function main() {
  const hederaAccountId = process.env.SMOKE_HEDERA_ACCOUNT_ID;

  if (!hederaAccountId) {
    throw new Error("SMOKE_HEDERA_ACCOUNT_ID is not set in .env");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const query = `
    select
      aw.id as wallet_id,
      aw.hedera_account_id,
      aw.created_at as wallet_created_at,
      a.id as agent_id,
      a.agent_name,
      a.creator_id
    from agent_wallets aw
    left join public."Agents" a on a.id = aw.agent_id
    where aw.hedera_account_id = $1
  `;

  const { rows } = await client.query(query, [hederaAccountId]);
  await client.end();

  if (rows.length === 0) {
    console.log(
      JSON.stringify(
        {
          found: false,
          message: "No wallet link found for the configured smoke Hedera account.",
          hederaAccountId,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        found: true,
        hederaAccountId,
        rows,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
