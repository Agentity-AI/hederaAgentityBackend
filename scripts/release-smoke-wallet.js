require("dotenv").config();

const { Client } = require("pg");

const CONFIRM_VALUE = "YES_RELEASE_SMOKE_WALLET";

async function main() {
  const hederaAccountId = process.env.SMOKE_HEDERA_ACCOUNT_ID;
  const confirm = process.env.SMOKE_RELEASE_CONFIRM;

  if (!hederaAccountId) {
    throw new Error("SMOKE_HEDERA_ACCOUNT_ID is not set in .env");
  }

  if (confirm !== CONFIRM_VALUE) {
    throw new Error(
      `Set SMOKE_RELEASE_CONFIRM=${CONFIRM_VALUE} before running this command.`,
    );
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const selectQuery = `
    select
      aw.id as wallet_id,
      aw.hedera_account_id,
      a.id as agent_id,
      a.agent_name,
      a.creator_id
    from agent_wallets aw
    left join public."Agents" a on a.id = aw.agent_id
    where aw.hedera_account_id = $1
  `;

  const { rows } = await client.query(selectQuery, [hederaAccountId]);

  if (rows.length === 0) {
    await client.end();
    console.log(
      JSON.stringify(
        {
          released: false,
          message: "No wallet link found for the configured smoke Hedera account.",
          hederaAccountId,
        },
        null,
        2,
      ),
    );
    return;
  }

  const unsafeRow = rows.find(
    (row) => !row.agent_name || !String(row.agent_name).startsWith("Smoke Agent"),
  );

  if (unsafeRow) {
    await client.end();
    throw new Error(
      `Refusing to release wallet because it is attached to a non-smoke agent: ${unsafeRow.agent_name || "unknown"}`,
    );
  }

  const deleteQuery = `delete from agent_wallets where hedera_account_id = $1`;
  const result = await client.query(deleteQuery, [hederaAccountId]);
  await client.end();

  console.log(
    JSON.stringify(
      {
        released: true,
        deletedCount: result.rowCount,
        hederaAccountId,
        releasedRows: rows,
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
