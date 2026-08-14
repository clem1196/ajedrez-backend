declare module "*.js" {
  const stockfish: () => {
    onmessage: (event: MessageEvent) => void;
    (cmd: string): void;
  };

  export default stockfish;
}

