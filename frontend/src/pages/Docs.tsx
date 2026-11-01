import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import { SiteNav, SiteFooter } from "../components/Site";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";

type L = { en: ReactNode; fr: ReactNode };

function Code({ samples }: { samples: Record<string, string> }) {
  const keys = Object.keys(samples);
  const [k, setK] = useState(keys[0]!);
  const [copied, setCopied] = useState(false);
  return (
    <div className="codeblock" style={{ margin: "12px 0 18px" }}>
      <div className="lang-tabs">
        {keys.map((x) => (
          <button key={x} className={x === k ? "active" : ""} onClick={() => setK(x)}>{x}</button>
        ))}
        <span className="grow" />
        <button
          className="codeblock-copy"
          onClick={async () => {
            await navigator.clipboard.writeText(samples[k]!);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre style={{ fontSize: 12.5 }}><code>{samples[k]}</code></pre>
    </div>
  );
}

function Endpoint({ method, path }: { method: "GET" | "POST" | "DELETE"; path: string }) {
  return (
    <div className="endpoint">
      <span className={`method ${method.toLowerCase()}`}>{method}</span>
      <span>{path}</span>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap" style={{ margin: "12px 0 18px" }}>
      <table className="table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ verticalAlign: "top" }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Docs() {
  const { locale } = useI18n();
  const { config } = useSession();
  const tr = (x: L) => (locale === "fr" ? x.fr : x.en);
  const ts = (x: { en: string; fr: string }) => (locale === "fr" ? x.fr : x.en);
  const base = `${typeof window !== "undefined" ? window.location.origin : config?.app.url}/api/v1`;
  const model = config?.ai.model || "qwen/qwen3.8-omni-flash:free";
  const nav: [string, L][] = [
    ["overview", { en: "Overview", fr: "Présentation" }],
    ["auth", { en: "Authentication", fr: "Authentification" }],
    ["quickstart", { en: "Quickstart", fr: "Démarrage rapide" }],
    ["chat", { en: "Chat completions", fr: "Complétions de chat" }],
    ["streaming", { en: "Streaming", fr: "Streaming" }],
    ["sdk", { en: "OpenAI SDK compatibility", fr: "Compatibilité SDK OpenAI" }],
    ["files", { en: "Files", fr: "Fichiers" }],
    ["models", { en: "Models", fr: "Modèles" }],
    ["usage", { en: "Usage", fr: "Consommation" }],
    ["limits", { en: "Rate limits & quotas", fr: "Limites et quotas" }],
    ["tokens", { en: "Token accounting", fr: "Comptabilisation des jetons" }],
    ["errors", { en: "Errors", fr: "Erreurs" }],
    ["security", { en: "Security best practices", fr: "Bonnes pratiques de sécurité" }]
  ];
  return (
    <div className="site">
      <SiteNav />
      <div className="docs">
        <nav className="docs-nav">
          <span className="label">API v1</span>
          {nav.map(([id, l]) => <a key={id} href={`#${id}`}>{tr(l)}</a>)}
        </nav>
        <article className="docs-body">
          <span className="eyebrow">{tr({ en: "Developer documentation", fr: "Documentation développeur" })}</span>
          <h1 style={{ marginTop: 12 }}>{tr({ en: "Integrate the OBSYDIA AI API", fr: "Intégrer l'API OBSYDIA AI" })}</h1>
          <p>{tr({
            en: "The OBSYDIA AI API gives your applications access to the same assistant that powers the OBSYDIA workspace: conversational answers, code generation and file understanding, with streaming and per-key usage analytics.",
            fr: "L'API OBSYDIA AI donne à vos applications accès au même assistant que l'espace OBSYDIA : réponses conversationnelles, génération de code et compréhension de fichiers, avec streaming et statistiques par clé."
          })}</p>

          <h2 id="overview">{tr(nav[0]![1])}</h2>
          <Table
            head={[ts({ en: "Item", fr: "Élément" }), ts({ en: "Value", fr: "Valeur" })]}
            rows={[
              ["Base URL", <code className="mono">{base}</code>],
              [tr({ en: "Format", fr: "Format" }), "JSON (UTF-8), multipart/form-data for file uploads"],
              [tr({ en: "Versioning", fr: "Versionnage" }), tr({ en: "The version is part of the path (/v1). Breaking changes ship as a new version.", fr: "La version fait partie du chemin (/v1). Les changements incompatibles sont publiés dans une nouvelle version." })],
              [tr({ en: "Access", fr: "Accès" }), <>{tr({ en: "Pro and Premium plans.", fr: "Offres Pro et Premium." })} <Link className="link" to="/pricing">{tr({ en: "See pricing", fr: "Voir les tarifs" })}</Link></>],
              [tr({ en: "Default model", fr: "Modèle par défaut" }), <code className="mono">{model}</code>]
            ]}
          />
          <Table
            head={["Endpoint", ts({ en: "Description", fr: "Description" })]}
            rows={[
              [<code className="mono">POST /chat</code>, tr({ en: "Create a chat completion (streaming or not).", fr: "Créer une complétion de chat (streaming ou non)." })],
              [<code className="mono">POST /chat/completions</code>, tr({ en: "Alias of /chat for OpenAI-compatible clients.", fr: "Alias de /chat pour les clients compatibles OpenAI." })],
              [<code className="mono">GET /models</code>, tr({ en: "List available models and verified capabilities.", fr: "Lister les modèles disponibles et leurs capacités vérifiées." })],
              [<code className="mono">GET /usage</code>, tr({ en: "Token balance and API usage for the key's account.", fr: "Solde de jetons et consommation API du compte." })],
              [<code className="mono">POST /files</code>, tr({ en: "Upload a file to reference in chat requests.", fr: "Envoyer un fichier à référencer dans les requêtes." })],
              [<code className="mono">GET /files · GET /files/:id · DELETE /files/:id</code>, tr({ en: "Manage uploaded files.", fr: "Gérer les fichiers envoyés." })]
            ]}
          />

          <h2 id="auth">{tr(nav[1]![1])}</h2>
          <p>{tr({
            en: "Create a key in your API dashboard. The full key is displayed only once — store it in a secret manager or an environment variable. Send it in the Authorization header of every request:",
            fr: "Créez une clé depuis votre tableau de bord API. La clé complète n'est affichée qu'une seule fois — conservez-la dans un gestionnaire de secrets ou une variable d'environnement. Envoyez-la dans l'en-tête Authorization de chaque requête :"
          })}</p>
          <Code samples={{ HTTP: "Authorization: Bearer obs_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" }} />
          <p>{tr({
            en: "Keys are stored hashed on our side. You can revoke or regenerate a key at any time; revoked keys stop working immediately. Never expose keys in browser or mobile code — call the API from your server.",
            fr: "Les clés sont stockées sous forme hachée. Vous pouvez révoquer ou régénérer une clé à tout moment ; une clé révoquée cesse immédiatement de fonctionner. N'exposez jamais vos clés dans du code navigateur ou mobile — appelez l'API depuis votre serveur."
          })}</p>

          <h2 id="quickstart">{tr(nav[2]![1])}</h2>
          <Code
            samples={{
              cURL: `export OBSYDIA_API_KEY="obs_live_..."

curl ${base}/chat \\
  -H "Authorization: Bearer $OBSYDIA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "system", "content": "Answer in one short paragraph." },
      { "role": "user", "content": "Explain what a REST API is." }
    ]
  }'`,
              "Node.js": `const res = await fetch("${base}/chat", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.OBSYDIA_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Write a debounce function in TypeScript." }],
    max_tokens: 800
  })
});
if (!res.ok) throw new Error((await res.json()).error.message);
const data = await res.json();
console.log(data.choices[0].message.content);
console.log("tokens:", data.usage.total_tokens);`,
              Python: `import os, requests

r = requests.post(
    "${base}/chat",
    headers={"Authorization": f"Bearer {os.environ['OBSYDIA_API_KEY']}"},
    json={"messages": [{"role": "user", "content": "Bonjour ! Présente-toi."}]},
    timeout=120,
)
r.raise_for_status()
print(r.json()["choices"][0]["message"]["content"])`,
              PHP: `<?php
$ch = curl_init("${base}/chat");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("OBSYDIA_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "messages" => [["role" => "user", "content" => "Hello"]],
  ]),
]);
$data = json_decode(curl_exec($ch), true);
echo $data["choices"][0]["message"]["content"];`
            }}
          />

          <h2 id="chat">{tr(nav[3]![1])}</h2>
          <Endpoint method="POST" path="/api/v1/chat" />
          <h3>{tr({ en: "Request body", fr: "Corps de la requête" })}</h3>
          <Table
            head={[ts({ en: "Field", fr: "Champ" }), "Type", ts({ en: "Required", fr: "Requis" }), "Description"]}
            rows={[
              [<code className="mono">messages</code>, "array", "✓", tr({ en: "Conversation, 1–200 items. Each item has role (system | user | assistant) and content (string, or an array of parts for images).", fr: "Conversation, 1 à 200 éléments. Chaque élément a un role (system | user | assistant) et un content (texte, ou tableau de parties pour les images)." })],
              [<code className="mono">model</code>, "string", "", tr({ en: "Model id from GET /models. Defaults to the platform default model.", fr: "Identifiant d'un modèle de GET /models. Par défaut, le modèle de la plateforme." })],
              [<code className="mono">stream</code>, "boolean", "", tr({ en: "Stream the answer with Server-Sent Events. Default false.", fr: "Diffuser la réponse en Server-Sent Events. false par défaut." })],
              [<code className="mono">max_tokens</code>, "integer", "", tr({ en: "Upper bound for generated tokens (1–32000). Also limited by your remaining balance.", fr: "Limite des jetons générés (1 à 32000). Également limitée par votre solde restant." })],
              [<code className="mono">temperature</code>, "number", "", tr({ en: "0–2. Lower is more deterministic. Ignored by models that do not support it.", fr: "0 à 2. Plus bas = plus déterministe. Ignoré par les modèles qui ne le prennent pas en charge." })],
              [<code className="mono">file_ids</code>, "string[]", "", tr({ en: "Up to 10 file ids from POST /files. Their extracted content is attached to the last user message.", fr: "Jusqu'à 10 identifiants de POST /files. Leur contenu extrait est joint au dernier message utilisateur." })]
            ]}
          />
          <p>{tr({
            en: "Your system messages are added as developer instructions on top of the OBSYDIA system prompt; the assistant's identity cannot be overridden.",
            fr: "Vos messages system sont ajoutés comme instructions développeur en plus du prompt système OBSYDIA ; l'identité de l'assistant ne peut pas être remplacée."
          })}</p>
          <h3>{tr({ en: "Image input", fr: "Entrée image" })}</h3>
          <p>{tr({
            en: "When GET /models reports capabilities.vision = true, a user message may contain image parts as data URLs or HTTPS URLs:",
            fr: "Lorsque GET /models indique capabilities.vision = true, un message utilisateur peut contenir des images (data URL ou URL HTTPS) :"
          })}</p>
          <Code samples={{ JSON: `{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "What is wrong with this layout?" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } }
    ]
  }]
}` }} />
          <h3>{tr({ en: "Response", fr: "Réponse" })}</h3>
          <Code samples={{ JSON: `{
  "id": "chatcmpl_obs_m3k2x9a1b2c3",
  "object": "chat.completion",
  "created": 1767225600,
  "model": "${model}",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "A REST API is ..." },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 412,
    "completion_tokens": 186,
    "total_tokens": 598,
    "estimated": false
  },
  "obsydia": { "remaining_tokens": 59402 }
}` }} />

          <h2 id="streaming">{tr(nav[4]![1])}</h2>
          <p>{tr({
            en: "With \"stream\": true the response is text/event-stream. Each event is a line starting with data: followed by a JSON chunk. The final chunk carries finish_reason and usage, then the stream ends with data: [DONE]. If an error occurs after streaming started, an event with an error object is sent.",
            fr: "Avec \"stream\": true, la réponse est en text/event-stream. Chaque événement est une ligne commençant par data: suivie d'un fragment JSON. Le dernier fragment contient finish_reason et usage, puis le flux se termine par data: [DONE]. En cas d'erreur après le début du flux, un événement contenant un objet error est envoyé."
          })}</p>
          <Code samples={{
            SSE: `data: {"id":"chatcmpl_obs_...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl_obs_...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":42,"total_tokens":62,"estimated":false}}

data: [DONE]`,
            "Node.js": `const res = await fetch("${base}/chat", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.OBSYDIA_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "Tell me a story" }] })
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6);
    if (payload === "[DONE]") continue;
    const chunk = JSON.parse(payload);
    if (chunk.error) throw new Error(chunk.error.message);
    process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
  }
}`,
            Python: `import json, os, requests

with requests.post(
    "${base}/chat",
    headers={"Authorization": f"Bearer {os.environ['OBSYDIA_API_KEY']}"},
    json={"stream": True, "messages": [{"role": "user", "content": "Tell me a story"}]},
    stream=True,
) as r:
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload == "[DONE]":
            break
        chunk = json.loads(payload)
        print(chunk["choices"][0]["delta"].get("content", ""), end="", flush=True)`
          }} />

          <h2 id="sdk">{tr(nav[5]![1])}</h2>
          <p>{tr({
            en: "The chat and models endpoints follow the OpenAI response format, so the official OpenAI SDKs work by changing the base URL. Only chat completions and model listing are supported through the SDK.",
            fr: "Les points d'accès chat et models suivent le format de réponse OpenAI : les SDK officiels OpenAI fonctionnent en changeant simplement l'URL de base. Seules les complétions de chat et la liste des modèles sont prises en charge via le SDK."
          })}</p>
          <Code samples={{
            "Node.js": `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OBSYDIA_API_KEY,
  baseURL: "${base}"
});

const stream = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Refactor this function to async/await" }],
  stream: true
});
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content || "");`,
            Python: `from openai import OpenAI

client = OpenAI(api_key=os.environ["OBSYDIA_API_KEY"], base_url="${base}")
resp = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Summarize the SOLID principles"}],
)
print(resp.choices[0].message.content)`
          }} />

          <h2 id="files">{tr(nav[6]![1])}</h2>
          <Endpoint method="POST" path="/api/v1/files" />
          <p>{tr({
            en: "Upload as multipart/form-data with the field name file. Accepted: PNG, JPG, WEBP, PDF, TXT/Markdown, source code files and ZIP archives. Types are detected from file content, not extensions. ZIP archives are inspected safely (size, entry count, compression ratio, path traversal and symlinks are checked). The maximum size depends on your plan.",
            fr: "Envoyez en multipart/form-data avec le champ file. Formats acceptés : PNG, JPG, WEBP, PDF, TXT/Markdown, fichiers de code source et archives ZIP. Le type est détecté d'après le contenu, pas l'extension. Les ZIP sont inspectés de façon sûre (taille, nombre d'entrées, taux de compression, traversée de chemin et liens symboliques). La taille maximale dépend de votre offre."
          })}</p>
          <Code samples={{
            cURL: `curl ${base}/files \\
  -H "Authorization: Bearer $OBSYDIA_API_KEY" \\
  -F "file=@./report.pdf"

# → { "object": "file", "id": "665f...", "kind": "document", "name": "report.pdf", "size": 48213, ... }

curl ${base}/chat \\
  -H "Authorization: Bearer $OBSYDIA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "file_ids": ["665f..."], "messages": [{ "role": "user", "content": "Summarize this report" }] }'`
          }} />
          <Endpoint method="GET" path="/api/v1/files" />
          <Endpoint method="GET" path="/api/v1/files/:id" />
          <Endpoint method="DELETE" path="/api/v1/files/:id" />

          <h2 id="models">{tr(nav[7]![1])}</h2>
          <Endpoint method="GET" path="/api/v1/models" />
          <Code samples={{ JSON: `{
  "object": "list",
  "data": [{
    "id": "${model}",
    "object": "model",
    "owned_by": "xkiro",
    "default": true,
    "capabilities": { "streaming": true, "vision": false, "audio": false, "tools": false }
  }]
}` }} />
          <p>{tr({
            en: "Capabilities are only reported as true after they have been verified for the model. Requests that use an unsupported capability return a 422 error instead of a silent failure.",
            fr: "Les capacités ne sont indiquées comme true qu'après vérification pour le modèle. Une requête utilisant une capacité non prise en charge renvoie une erreur 422 plutôt qu'un échec silencieux."
          })}</p>

          <h2 id="usage">{tr(nav[8]![1])}</h2>
          <Endpoint method="GET" path="/api/v1/usage" />
          <Code samples={{ JSON: `{
  "plan": "pro",
  "tokens": { "total": 60000, "used": 1830, "remaining": 58170, "bonus": 0, "reset_at": "2026-11-01T21:00:00.000Z" },
  "api": { "requests_30d": 42, "tokens_30d": 18740, "rate_limit_per_minute": 30 }
}` }} />

          <h2 id="limits">{tr(nav[9]![1])}</h2>
          <Table
            head={[ts({ en: "Plan", fr: "Offre" }), ts({ en: "Requests / minute / key", fr: "Requêtes / minute / clé" }), ts({ en: "Token allowance", fr: "Quota de jetons" })]}
            rows={(config?.plans || []).filter((p) => p.apiAccess).map((p) => [p.id, String(p.apiRequestsPerMinute), `${p.tokenLimit.toLocaleString(locale)} / ${p.resetHours} h`])}
          />
          <p>{tr({
            en: "Rate-limit headers (RateLimit, RateLimit-Policy) are returned on every response. When you exceed the limit you receive 429 rate_limited; wait before retrying. API usage and in-app usage share the same token balance.",
            fr: "Les en-têtes de limitation (RateLimit, RateLimit-Policy) sont renvoyés à chaque réponse. En cas de dépassement, vous recevez 429 rate_limited ; patientez avant de réessayer. L'API et l'application partagent le même solde de jetons."
          })}</p>

          <h2 id="tokens">{tr(nav[10]![1])}</h2>
          <p>{tr({
            en: "Each request reserves prompt tokens plus the maximum output before calling the model, so concurrent requests can never overspend your balance. After completion, the actual usage reported by the provider is charged (prompt + completion tokens) and the rest of the reservation is released. If the provider does not report usage, an estimate is recorded and flagged with \"estimated\": true. Attached files count as input. Every charge appears in your token history.",
            fr: "Chaque requête réserve les jetons d'entrée plus la sortie maximale avant d'appeler le modèle : des requêtes simultanées ne peuvent jamais dépasser votre solde. Après la réponse, la consommation réelle indiquée par le fournisseur est débitée (entrée + sortie) et le reste de la réservation est libéré. Si le fournisseur n'indique pas la consommation, une estimation est enregistrée et signalée par \"estimated\": true. Les fichiers joints comptent comme entrée. Chaque débit apparaît dans votre historique."
          })}</p>

          <h2 id="errors">{tr(nav[11]![1])}</h2>
          <Code samples={{ JSON: `{ "error": { "code": "insufficient_tokens", "message": "Not enough tokens for this request", "details": { "remaining": 120, "required": 640 } } }` }} />
          <Table
            head={["HTTP", "code", "Description"]}
            rows={[
              ["400", "validation_error", tr({ en: "The body does not match the schema. details lists the fields.", fr: "Le corps ne respecte pas le schéma. details liste les champs." })],
              ["400", "model_not_available", tr({ en: "Unknown model id.", fr: "Identifiant de modèle inconnu." })],
              ["400", "provider_rejected_request", tr({ en: "The model rejected a parameter.", fr: "Le modèle a refusé un paramètre." })],
              ["401", "invalid_api_key", tr({ en: "Missing, invalid or revoked key.", fr: "Clé absente, invalide ou révoquée." })],
              ["402", "insufficient_tokens", tr({ en: "Balance too low. Wait for the reset or upgrade.", fr: "Solde insuffisant. Attendez la réinitialisation ou changez d'offre." })],
              ["403", "plan_upgrade_required", tr({ en: "The account plan does not include API access.", fr: "L'offre du compte n'inclut pas l'accès API." })],
              ["404", "file_not_found", tr({ en: "A file id does not belong to your account.", fr: "Un identifiant de fichier n'appartient pas à votre compte." })],
              ["413", "file_too_large", tr({ en: "File exceeds your plan's limit.", fr: "Le fichier dépasse la limite de votre offre." })],
              ["422", "vision_not_supported", tr({ en: "Images sent to a model without vision.", fr: "Images envoyées à un modèle sans vision." })],
              ["429", "rate_limited", tr({ en: "Too many requests for this key.", fr: "Trop de requêtes pour cette clé." })],
              ["429", "provider_rate_limited", tr({ en: "Upstream capacity is temporarily saturated. Retry with backoff.", fr: "Capacité amont temporairement saturée. Réessayez avec un délai croissant." })],
              ["502", "provider_error", tr({ en: "The AI provider returned an error.", fr: "Le fournisseur IA a renvoyé une erreur." })],
              ["503", "provider_unavailable", tr({ en: "No provider capacity available right now.", fr: "Aucune capacité fournisseur disponible pour le moment." })]
            ]}
          />
          <p>{tr({
            en: "Retry 429 and 5xx responses with exponential backoff (for example 1 s, 2 s, 4 s, with jitter). Do not retry 4xx errors other than 429 without changing the request.",
            fr: "Réessayez les réponses 429 et 5xx avec un délai exponentiel (par exemple 1 s, 2 s, 4 s, avec une part aléatoire). Ne réessayez pas les erreurs 4xx autres que 429 sans modifier la requête."
          })}</p>

          <h2 id="security">{tr(nav[12]![1])}</h2>
          <ul>
            <li>{tr({ en: "Keep keys server-side; use one key per environment (development, staging, production).", fr: "Gardez les clés côté serveur ; utilisez une clé par environnement (développement, préproduction, production)." })}</li>
            <li>{tr({ en: "Rotate keys with Regenerate and revoke unused keys.", fr: "Faites tourner vos clés avec Régénérer et révoquez celles qui ne servent plus." })}</li>
            <li>{tr({ en: "Never put secrets or personal data in prompts unless required.", fr: "N'incluez jamais de secrets ou de données personnelles dans les prompts sauf nécessité." })}</li>
            <li>{tr({ en: "Validate and sanitize model output before rendering it as HTML or executing it.", fr: "Validez et assainissez la sortie du modèle avant de l'afficher en HTML ou de l'exécuter." })}</li>
            <li>{tr({ en: "Monitor errors and usage from the API dashboard.", fr: "Surveillez erreurs et consommation depuis le tableau de bord API." })}</li>
          </ul>
          <p className="dim" style={{ marginTop: 40 }}>
            {tr({ en: "Questions? Contact", fr: "Des questions ? Écrivez à" })} <a className="link" href={`mailto:${config?.app.email}`}>{config?.app.email}</a>.
          </p>
        </article>
      </div>
      <SiteFooter />
    </div>
  );
}
