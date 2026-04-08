class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function requireString(value, fieldName, options = {}) {
  const {
    min = 1,
    max = 255,
    allowEmpty = false,
  } = options;

  const normalized = normalizeString(value);

  if (!allowEmpty && !normalized) {
    throw new ValidationError(`${fieldName} is required`);
  }

  if (normalized && normalized.length < min) {
    throw new ValidationError(`${fieldName} must be at least ${min} characters`);
  }

  if (normalized.length > max) {
    throw new ValidationError(`${fieldName} must be ${max} characters or fewer`);
  }

  return normalized;
}

function optionalString(value, fieldName, options = {}) {
  if (value == null || value === "") return null;
  return requireString(value, fieldName, { ...options, allowEmpty: false });
}

function requireEmail(value, fieldName = "email") {
  const normalized = requireString(value, fieldName, { max: 320 });
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalized)) {
    throw new ValidationError(`${fieldName} must be a valid email address`);
  }

  return normalized.toLowerCase();
}

function requirePassword(value, fieldName = "password") {
  const normalized = requireString(value, fieldName, { min: 8, max: 128 });

  if (!/[a-z]/i.test(normalized) || !/\d/.test(normalized)) {
    throw new ValidationError(
      `${fieldName} must include at least one letter and one number`,
    );
  }

  return normalized;
}

function requireUuid(value, fieldName) {
  const normalized = requireString(value, fieldName, { min: 36, max: 36 });
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`);
  }

  return normalized;
}

function optionalObject(value, fieldName) {
  if (value == null) return null;

  if (!isPlainObject(value)) {
    throw new ValidationError(`${fieldName} must be a JSON object`);
  }

  return value;
}

function requireObject(value, fieldName) {
  if (!isPlainObject(value)) {
    throw new ValidationError(`${fieldName} must be a JSON object`);
  }

  return value;
}

function optionalBoolean(value, fieldName) {
  if (value == null) return null;

  if (typeof value !== "boolean") {
    throw new ValidationError(`${fieldName} must be a boolean`);
  }

  return value;
}

function optionalUrl(value, fieldName) {
  const normalized = optionalString(value, fieldName, { max: 2048 });
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new ValidationError(`${fieldName} must be a valid http or https URL`);
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }

  return normalized;
}

function optionalEnum(value, fieldName, allowedValues) {
  const normalized = optionalString(value, fieldName, { max: 64 });
  if (!normalized) return null;

  if (!allowedValues.includes(normalized)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`,
    );
  }

  return normalized;
}

function requireHederaAccountId(value, fieldName = "hederaAccountId") {
  const normalized = requireString(value, fieldName, { max: 32 });
  const pattern = /^\d+\.\d+\.\d+$/;

  if (!pattern.test(normalized)) {
    throw new ValidationError(`${fieldName} must look like 0.0.123456`);
  }

  return normalized;
}

function optionalFiniteNumber(value, fieldName) {
  if (value == null || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  return numeric;
}

module.exports = {
  ValidationError,
  normalizeString,
  optionalBoolean,
  optionalEnum,
  optionalFiniteNumber,
  optionalObject,
  optionalString,
  optionalUrl,
  requireEmail,
  requireHederaAccountId,
  requireObject,
  requirePassword,
  requireString,
  requireUuid,
};
