require("dotenv").config();

const { Client } = require("pg");

const APPLY = process.env.APPLY_AGENT_REPUTATION_CLEANUP === "true";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const duplicatesQuery = `
    with ranked as (
      select
        id,
        agent_id,
        score,
        risk_level,
        "createdAt",
        "updatedAt",
        row_number() over (
          partition by agent_id
          order by "updatedAt" desc nulls last, "createdAt" desc nulls last, id desc
        ) as keep_rank
      from "AgentReputations"
    )
    select
      agent_id,
      count(*)::int as row_count,
      json_agg(
        json_build_object(
          'id', id,
          'score', score,
          'riskLevel', risk_level,
          'createdAt', "createdAt",
          'updatedAt', "updatedAt",
          'keep', keep_rank = 1
        )
        order by keep_rank asc, "updatedAt" desc nulls last, "createdAt" desc nulls last
      ) as rows
    from ranked
    group by agent_id
    having count(*) > 1
    order by count(*) desc, agent_id asc
  `;

  const duplicates = await client.query(duplicatesQuery);

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        duplicateAgentCount: duplicates.rows.length,
        duplicateAgents: duplicates.rows,
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    await client.end();
    return;
  }

  const deleteQuery = `
    with ranked as (
      select
        id,
        row_number() over (
          partition by agent_id
          order by "updatedAt" desc nulls last, "createdAt" desc nulls last, id desc
        ) as keep_rank
      from "AgentReputations"
    )
    delete from "AgentReputations"
    where id in (
      select id
      from ranked
      where keep_rank > 1
    )
    returning id, agent_id
  `;

  const deleted = await client.query(deleteQuery);

  console.log(
    JSON.stringify(
      {
        deletedCount: deleted.rows.length,
        deletedRows: deleted.rows,
      },
      null,
      2,
    ),
  );

  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
