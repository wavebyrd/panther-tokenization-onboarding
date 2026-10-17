import { envelope, ok } from "@/server/api";
import { plannerDefaults } from "@/server/simulate";
import { GLIDE_DEFAULTS, GLIDE_LIMITS } from "@/lib/sim/glidepath";

export const dynamic = "force-dynamic";

/** GET /api/v1/simulate/defaults — starting values for the planner, with today's typical stablecoin rate. */
export async function GET() {
  const live = await plannerDefaults();
  return ok(
    envelope({
      glidePath: { ...GLIDE_DEFAULTS, stableReturn: live.stableReturn ?? GLIDE_DEFAULTS.stableReturn },
      limits: GLIDE_LIMITS,
      stableReturnBasis: live.stableReturnBasis,
    }),
    300,
  );
}
