import type { Config, Context } from "@netlify/functions";
import { handle } from "./_shared/router";

export default async (req: Request, _context: Context) => handle(req);

export const config: Config = {
  path: "/api/*",
};
