// src/types/express.d.ts

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userNick?: string;
      userEmail?: string;
      userElo?: number;
      isAdmin?: boolean;
      authProvider?: string;
    }
  }
}

export {};