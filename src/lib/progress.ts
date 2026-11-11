export interface ProgressState {
  phase: string;
  current: number;
  total: number;
  logs: string[];
  running: boolean;
}

let state: ProgressState = {
  phase: "idle",
  current: 0,
  total: 0,
  logs: [],
  running: false,
};

// Timestamps are relative to the start of the current refresh, so repeated
// lines (e.g. stalled scroll rounds) stay distinguishable in the log view.
let startedAt = 0;

export function resetProgress() {
  startedAt = Date.now();
  state = { phase: "idle", current: 0, total: 0, logs: [], running: true };
}

export function getProgress(): ProgressState {
  return { ...state, logs: [...state.logs] };
}

export function setProgress(phase: string, current?: number, total?: number) {
  state.phase = phase;
  if (current !== undefined) state.current = current;
  if (total !== undefined) state.total = total;
}

export function addLog(msg: string) {
  const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  state.logs.push(`[+${elapsed}s] ${msg}`);
  if (state.logs.length > 300) state.logs = state.logs.slice(-300);
}

export function finishProgress() {
  state.running = false;
  state.phase = "done";
}