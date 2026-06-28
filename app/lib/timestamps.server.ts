export interface Clock {
  now: () => Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function toUtcIsoTimestamp(date: Date) {
  return date.toISOString();
}
