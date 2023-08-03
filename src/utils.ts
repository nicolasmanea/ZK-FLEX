export function getTime(delayInSeconds = 0) {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return nowInSeconds + delayInSeconds;
}
export const READINGS = 30;

export const SECOND = 1;
export const MINUTE: number = 60 * SECOND;
export const THIRTY_MINUTES: number = 30 * MINUTE;
export const TEN_MINUTES: number = 10 * MINUTE;
export const TWENTY_SECONDS: number = 10 * SECOND;
