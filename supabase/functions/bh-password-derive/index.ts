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
// Esta funcao atende apenas ao servidor da Black Hands. Nao aceita
// credenciais publicas nem sessao de cliente. A permisao real e verificada
// no PostgREST do mesmo projeto, sem consultar ou retornar registros.
async function isInternalCall(req: Request): Promise<boolean> {
  const supplied = req.headers.get("authorization");
  if (!supplied?.startsWith("Bearer ")) return false;
  const actual = supplied.slice(7);
  if (!actual || actual.length > 2048) return false;

  // O endereco do projeto nao e segredo. Usar o destino fixo evita depender
  // das variaveis internas opcionais de Edge Functions.
  const projectUrl = "https://nfemozpmqfgedxfuzamm.supabase.co";
  try {
    const response = await fetch(
      projectUrl + "/rest/v1/bh_customer_accounts?select=id&limit=0",
      {
        method: "GET",
        headers: {
          "apikey": actual,
          "authorization": "Bearer " + actual,
          "accept": "application/json"
        },
        cache: "no-store"
      }
    );
    if (!response.ok) console.error("KDF authorization rejected by Supabase:", response.status);
    return response.ok;
  } catch (error) {
    console.error("KDF authorization request failed:", error instanceof Error ? error.name : "unknown");
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
