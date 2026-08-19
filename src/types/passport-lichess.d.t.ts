declare module "passport-lichess" {
  import { Strategy as PassportStrategy } from "passport";
  import { Request } from "express";

  export interface StrategyOptions {
    clientID: string;
    callbackURL: string;
    scope?: string[];
  }

  export class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (error: any, user?: any) => void
      ) => void
    );
  }
}