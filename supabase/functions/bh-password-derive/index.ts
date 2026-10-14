// Black Hands — derivação de senha no Supabase Edge.
 // Serviço interno: não aceita credenciais do navegador nem tokens de clientes.
import { scrypt, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function reply(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
}
// Caso uma chave administrativa tenha sido renovada, conferir acesso real
// ao Supabase. Nunca decodificar JWTs sem verificar assinaturas.
async function isInternalCall(req: Request): Promise<boolean> {
  const supplied = req.headers.get("authorization");
  if (!supplied?.startsWith("Bearer ")) return false;
  const actual = supplied.slice(7);
  if (!actual || actual.length > 2048) return false;

  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (expected) {
    const a = Buffer.from(actual, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }

  // Consulta somente de permissao, sem retornar dados de clientes.
  let supabase: URL;
  try {
    supabase = new URL(Deno.env.get("SUPABASE_URL") || "");
    if (supabase.protocol !== "https:" || !supabase.hostname.endsWith(".supabase.co")) return false;
    if (supabase.pathname !== "/" || supabase.search || supabase.hash) return false;
  } catch { return false; }
  try {
    const response = await fetch(
      supabase.origin + "/rest/v1/bh_customer_accounts?select=id&limit=0",
      {
        method: "GET",
        headers: {
          "apikey": actual,
          "authorization": "Bearer " + actual,
          "accept": "application/json"
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return reply(405, "Método não permitido.");
  if (!await isInternalCall(req)) return reply(401, "Não autorizado.");
  try {
    const payload = await req.json();
    const password = payload?.password;
    const salt = payload?.salt;
    if (typeof password !== "string" || password.length < 1 || password.length > 128 ||
        typeof salt !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(salt)) {
      return reply(400, "Entrada inválida.");
    }
    const bytes = await derive(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }) as Buffer;
    return new Response(JSON.stringify({ hash: bytes.toString("base64url") }), {
      status: 200,
      headers: jsonHeaders
    });
  } catch {
    return reply(503, "Derivação indisponível.");
  }
});
