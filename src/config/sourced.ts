// Every rule and every points value is wrapped in this label:
// the value itself, where it came from, and how sure we are.

export type Status = "certain" | "likely" | "guessing" | "conflict" | "unverified";

export interface Sourced<T> {
  value: T;
  source: string;
  status: Status;
}

export function sourced<T>(value: T, status: Status, source: string): Sourced<T> {
  return { value, source, status };
}
