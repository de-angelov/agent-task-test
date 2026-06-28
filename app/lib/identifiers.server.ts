import { randomUUID } from "node:crypto";

export function createIdentifier() {
  return randomUUID();
}
