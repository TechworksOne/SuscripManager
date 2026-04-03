import crypto from "crypto";

const KEY_B64 = process.env.CRED_ENC_KEY_B64;
if (!KEY_B64) throw new Error("Falta CRED_ENC_KEY_B64 en .env");

const KEY = Buffer.from(KEY_B64, "base64");
if (KEY.length !== 32) throw new Error("CRED_ENC_KEY_B64 debe decodificar a 32 bytes");

export function encryptText(plain: string) {
  const iv = crypto.randomBytes(12); // recomendado para GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);

  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Guardamos todo en base64 para DB
  return {
    iv_b64: iv.toString("base64"),
    tag_b64: tag.toString("base64"),
    ct_b64: ciphertext.toString("base64"),
  };
}

export function decryptText(payload: { iv_b64: string; tag_b64: string; ct_b64: string }) {
  const iv = Buffer.from(payload.iv_b64, "base64");
  const tag = Buffer.from(payload.tag_b64, "base64");
  const ct = Buffer.from(payload.ct_b64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

/**
 * Empaqueta en un solo string para guardar en TEXT:
 * iv.tag.ct (base64)
 */
export function pack(enc: { iv_b64: string; tag_b64: string; ct_b64: string }) {
  return `${enc.iv_b64}.${enc.tag_b64}.${enc.ct_b64}`;
}

export function unpack(s: string) {
  const [iv_b64, tag_b64, ct_b64] = (s || "").split(".");
  if (!iv_b64 || !tag_b64 || !ct_b64) throw new Error("Formato de cifrado inválido");
  return { iv_b64, tag_b64, ct_b64 };
}
