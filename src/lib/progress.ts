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

export function resetProgress() {
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
  state.logs.push(msg);
  if (state.logs.length > 300) state.logs = state.logs.slice(-300);
}

export function finishProgress() {
  state.running = false;
  state.phase = "done";
}