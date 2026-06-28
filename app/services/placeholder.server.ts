import { ok, type Result } from "neverthrow";

export interface PlaceholderMessage {
  message: string;
}

export function getPlaceholderMessage(): Result<PlaceholderMessage, never> {
  return ok({ message: "Server service layer is available." });
}
