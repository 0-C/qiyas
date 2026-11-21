import type { Config, Context } from "@netlify/functions";
import { handle } from "./_shared/router";

export default async (req: Request, _context: Context) => handle(req);

export const config = {
  path: "/api/*",
  // Frankfurt, next to a Render Postgres in eu-central-1. Needs a Netlify plan that allows a custom region.
  region: "fra",
} as Config;
