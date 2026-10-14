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
function isInternalCall(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supplied = req.headers.get("authorization");
  if (!expected || !supplied?.startsWith("Bearer ")) return false;
  const actual = supplied.slice(7);
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return reply(405, "Método não permitido.");
  if (!isInternalCall(req)) return reply(401, "Não autorizado.");
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
