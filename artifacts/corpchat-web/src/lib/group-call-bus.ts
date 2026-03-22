type GroupCallData = {
  type: string;
  [key: string]: any;
};

type GroupCallHandler = (data: GroupCallData) => void;

let _handler: GroupCallHandler | null = null;

export function onGroupCallSignal(handler: GroupCallHandler): () => void {
  _handler = handler;
  return () => {
    if (_handler === handler) {
      _handler = null;
    }
  };
}

export function emitGroupCallSignal(data: GroupCallData): void {
  if (_handler) {
    _handler(data);
  }
}
