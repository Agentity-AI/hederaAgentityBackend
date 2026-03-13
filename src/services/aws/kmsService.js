const crypto = require("crypto");
const { KMSClient, SignCommand } = require("@aws-sdk/client-kms");
const KmsAuditLog = require("../../models/kmsAuditLog");

function getKmsClient() {
  if (!process.env.AWS_REGION) return null;
  return new KMSClient({ region: process.env.AWS_REGION });
}

async function signPayloadWithKms({
  userId = null,
  agentId = null,
  kmsKeyId = null,
  payload,
}) {
  const payloadString = JSON.stringify(payload || {});
  const digest = crypto.createHash("sha256").update(payloadString).digest();

  const client = getKmsClient();

  if (!client || !kmsKeyId) {
    const audit = await KmsAuditLog.create({
      user_id: userId,
      agent_id: agentId,
      kms_key_id: kmsKeyId,
      operation: "sign",
      request_payload: payload,
      response_payload: {
        digest: digest.toString("hex"),
        simulated: true,
      },
      status: "simulated",
    });

    return {
      signature: null,
      digest: digest.toString("hex"),
      simulated: true,
      auditId: audit.id,
    };
  }

  try {
    const response = await client.send(
      new SignCommand({
        KeyId: kmsKeyId,
        Message: digest,
        MessageType: "DIGEST",
        SigningAlgorithm: "ECDSA_SHA_256",
      })
    );

    const audit = await KmsAuditLog.create({
      user_id: userId,
      agent_id: agentId,
      kms_key_id: kmsKeyId,
      operation: "sign",
      request_payload: payload,
      response_payload: {
        signature: Buffer.from(response.Signature || []).toString("hex"),
      },
      status: "success",
    });

    return {
      signature: Buffer.from(response.Signature || []).toString("hex"),
      digest: digest.toString("hex"),
      simulated: false,
      auditId: audit.id,
    };
  } catch (error) {
    await KmsAuditLog.create({
      user_id: userId,
      agent_id: agentId,
      kms_key_id: kmsKeyId,
      operation: "sign",
      request_payload: payload,
      response_payload: {
        error: error.message,
      },
      status: "failed",
    });

    throw error;
  }
}

module.exports = { signPayloadWithKms };