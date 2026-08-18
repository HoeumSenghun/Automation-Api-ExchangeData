import { createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt, constants } from "crypto";
import type { RsaProcess } from "./types";

function toPem(raw: string, kind: "PRIVATE KEY" | "PUBLIC KEY"): string {
  let text = raw.trim();
  if (text.startsWith("-----")) {
    return text;
  }
  text = text.replace(/\s/g, "");
  const lines = text.match(/.{1,64}/g)?.join("\n") ?? text;
  return `-----BEGIN ${kind}-----\n${lines}\n-----END ${kind}-----`;
}

export function buildFinalToken(
  rawToken: string,
  privateKeyB64: string,
  publicKeyB64: string,
  pin: string,
): RsaProcess {
  const privateKey = createPrivateKey({
    key: toPem(privateKeyB64, "PRIVATE KEY"),
    format: "pem",
  });
  const publicKey = createPublicKey({
    key: toPem(publicKeyB64, "PUBLIC KEY"),
    format: "pem",
  });
  const decrypted = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(rawToken, "base64"),
  ).toString("utf8");
  const combined = `${decrypted}|${pin}`;
  const finalToken = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(combined, "utf8"),
  ).toString("base64");
  return { decrypted, combined, finalToken };
}
