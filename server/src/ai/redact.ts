/**
 * Redaction applied to every piece of text before it is sent to an external AI
 * service. The project brief forbids exposing credentials or confidential data
 * to public AI services, and the Gemini free tier may use content to improve
 * Google's products — so this is mandatory, not optional.
 *
 * It is conservative: it prefers hiding a harmless value over leaking a secret.
 */
const RULES: { name: string; re: RegExp; replace: string }[] = [
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replace: "[REDACTED PRIVATE KEY]" },
  { name: "authorization header", re: /(authorization\s*:\s*)([^\r\n]+)/gi, replace: "$1[REDACTED]" },
  { name: "cookie header", re: /((?:set-)?cookie\s*:\s*)([^\r\n]+)/gi, replace: "$1[REDACTED]" },
  { name: "api key header", re: /((?:x-api-key|api-key|x-auth-token)\s*:\s*)([^\r\n]+)/gi, replace: "$1[REDACTED]" },
  { name: "bearer token", re: /\b(bearer\s+)[a-z0-9._~+/=-]{8,}/gi, replace: "$1[REDACTED]" },
  { name: "JWT", re: /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, replace: "[REDACTED JWT]" },
  { name: "provider key", re: /\b(?:sk-[a-zA-Z0-9-_]{16,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abpr]-[A-Za-z0-9-]{10,})\b/g, replace: "[REDACTED KEY]" },
  {
    name: "secret assignment",
    // password=..., "token": "...", $db_pass = '...', secret: ...
    re: /((?:["']?\$?[a-z_]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|session[_-]?id|sessionid|credential)[a-z_]*["']?)\s*[:=]\s*)(?!\[REDACTED)("[^"]*"|'[^']*'|[^\s&,;}]+)/gi,
    replace: "$1[REDACTED]",
  },
  { name: "email address", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replace: "[REDACTED EMAIL]" },
];

export interface Redacted {
  text: string;
  count: number;
}

export function redact(input: string): Redacted {
  let text = input;
  let count = 0;
  for (const rule of RULES) {
    text = text.replace(rule.re, (...m: string[]) => {
      count++;
      // Re-apply the replacement template against the match groups.
      return rule.replace.replace(/\$(\d)/g, (_s, i: string) => m[Number(i)] ?? "");
    });
  }
  return { text, count };
}

/** Bounded excerpt with an explicit marker, so truncation is never silent. */
export function excerpt(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[… ${text.length - max} more characters not sent]`;
}
