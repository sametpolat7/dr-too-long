// Two ends of a runtime port, linked as Chrome links them. A message reaches the other end later,
// in order and as JSON; a disconnect reaches it after the messages posted before it. A disconnected
// end receives nothing more, and posting on it throws.
export interface PortEnd {
  name: string;
  onMessage: { addListener(listener: (message: never) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  postMessage(message: unknown): void;
  disconnect(): void;
}

interface State {
  connected: boolean;
  message: Array<(message: never) => void>;
  disconnect: Array<() => void>;
}

export function linkedPorts(name: string): [client: PortEnd, worker: PortEnd] {
  const end = (own: State, other: State): PortEnd => ({
    name,
    onMessage: { addListener: (listener) => void own.message.push(listener) },
    onDisconnect: { addListener: (listener) => void own.disconnect.push(listener) },
    postMessage(message) {
      if (!own.connected) throw new Error('Attempting to use a disconnected port object');
      const json = JSON.stringify(message);
      queueMicrotask(() => {
        if (other.connected)
          for (const listener of other.message) listener(JSON.parse(json) as never);
      });
    },
    disconnect() {
      own.connected = false;
      queueMicrotask(() => {
        if (!other.connected) return;
        other.connected = false;
        for (const listener of other.disconnect) listener();
      });
    },
  });
  const client: State = { connected: true, message: [], disconnect: [] };
  const worker: State = { connected: true, message: [], disconnect: [] };
  return [end(client, worker), end(worker, client)];
}
