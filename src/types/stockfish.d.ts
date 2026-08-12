// src/types/stockfish.d.ts
declare module "stockfish" {
  export default function stockfish(): {
    postMessage: (command: string) => void;
    onmessage: (event: any) => void;
  };
}
