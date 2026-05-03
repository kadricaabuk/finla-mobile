import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { loadFeatureFlags } from "../_shared/feature-config.ts";
import {
  getSubjectFromAuthHeader,
  SessionAuthError,
} from "../_shared/session-auth.ts";

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Endpoint is authenticated to keep rollout control internal.
    await getSubjectFromAuthHeader(req);
    const features = await loadFeatureFlags();
    return Response.json({ features }, { headers: corsHeaders });
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json(
        { error: err.message },
        { status: err.status, headers: corsHeaders },
      );
    }
    const message =
      err instanceof Error
        ? err.message
        : "Feature konfigürasyonu yüklenemedi.";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});
