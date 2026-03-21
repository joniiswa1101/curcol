type CallSignalData = {
  type: string;
  [key: string]: any;
};

type CallSignalHandler = (data: CallSignalData) => void;

let _handler: CallSignalHandler | null = null;
let _wsSend: ((data: object) => void) | null = null;

export function onCallSignal(handler: CallSignalHandler): () => void {
  _handler = handler;
  console.log("[CallBus] Handler registered");
  return () => {
    if (_handler === handler) {
      _handler = null;
      console.log("[CallBus] Handler unregistered");
    }
  };
}

export function emitCallSignal(data: CallSignalData): void {
  console.log("[CallBus] Emitting signal:", data.type, "handler:", _handler ? "YES" : "NO");
  if (_handler) {
    _handler(data);
  } else {
    console.warn("[CallBus] No handler registered! Signal lost:", data.type);
  }
}

export function registerWsSend(fn: (data: object) => void): void {
  _wsSend = fn;
  console.log("[CallBus] WS send function registered");
}

export function sendCallMessage(data: object): void {
  if (_wsSend) {
    _wsSend(data);
  } else {
    console.error("[CallBus] No WS send function registered! Message not sent:", data);
  }
}
