import { api, json } from "@/server/http";
import { getCoverageTree } from "@/server/coverage";
export const GET = api(async () => json({ nodes: await getCoverageTree() }));
