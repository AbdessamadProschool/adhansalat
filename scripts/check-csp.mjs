/**
 * Content-Security-Policy guard.
 *
 * `index.html` carries the policy as a meta tag. Scripts are allowed by SHA-256
 * hash, never by `'unsafe-inline'`: the only inline script is the small theme
 * bootstrap, and its exact bytes are pinned in the policy.
 *
 * Pinning by hand rots silently: edit the bootstrap and the browser quietly
 * refuses to run it. This module recomputes the hash from the file, so a mismatch
 * fails the build (`npm run build`) and the test suite (`tests/csp.test.ts`)
 * instead of shipping a policy that blocks its own script.
 *
 * It also rejects the two shapes that would silently re-open inline execution:
 * `on*=` handler attributes and `javascript:` URLs.
 *
 * The meta tag cannot express `frame-ancestors`, `X-Content-Type-Options` or
 * `Strict-Transport-Security`; those are response headers and are documented in
 * docs/SECURITE.md for the production host.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRECTIVE_REQUIRED = {
  'default-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'none'",
};

/** SHA-256 of every inline script, base64, in document order. */
export function inlineScriptHashes(html) {
  const hashes = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    hashes.push(`sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}`);
  }
  return hashes;
}

/** Raw `content` of the CSP meta tag, or null. */
export function policyContent(html) {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metas) {
    if (!/http-equiv\s*=\s*["']?Content-Security-Policy["']?/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*"([^"]*)"/i) ?? tag.match(/content\s*=\s*'([^']*)'/i);
    return content ? content[1] : '';
  }
  return null;
}

/** Parsed directives: `{ 'script-src': ["'self'", "'sha256-…'"] }`. */
export function parsePolicy(policy) {
  const directives = {};
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    directives[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  return directives;
}

/**
 * Returns `{ ok, problems, hashes, policy }`. `ok` is false when the policy
 * would block the app's own bootstrap or would allow inline script execution.
 */
export function checkIndexHtml(html) {
  const problems = [];
  const policy = policyContent(html);
  const hashes = inlineScriptHashes(html);

  if (policy === null) {
    problems.push('index.html has no Content-Security-Policy meta tag');
    return { ok: false, problems, hashes, policy: null };
  }
  if (policy.trim() === '') {
    problems.push('the Content-Security-Policy meta tag is empty');
    return { ok: false, problems, hashes, policy };
  }

  const directives = parsePolicy(policy);
  const scriptSrc = directives['script-src'] ?? [];

  if (scriptSrc.includes("'unsafe-inline'")) {
    problems.push("script-src must not contain 'unsafe-inline' (scripts are pinned by hash)");
  }
  if (scriptSrc.includes("'unsafe-eval'") || directives['script-src-elem']?.includes("'unsafe-eval'")) {
    problems.push("CSP must not allow 'unsafe-eval'");
  }
  for (const hash of hashes) {
    if (!scriptSrc.includes(`'${hash}'`)) {
      problems.push(`script-src is missing the hash of an inline script: '${hash}'`);
    }
  }
  for (const [name, value] of Object.entries(DIRECTIVE_REQUIRED)) {
    const tokens = directives[name];
    if (!tokens) problems.push(`CSP is missing the ${name} directive`);
    else if (!tokens.includes(value)) problems.push(`CSP ${name} must contain ${value}`);
  }

  if (/\son[a-z]+\s*=/i.test(stripScripts(html))) {
    problems.push('an inline event handler attribute (on*=) would be blocked or would weaken the policy');
  }
  if (/\b(?:href|src|xlink:href)\s*=\s*["']?\s*javascript:/i.test(stripScripts(html))) {
    problems.push('a javascript: URL is present');
  }

  return { ok: problems.length === 0, problems, hashes, policy };
}

/** Ignores the inline bootstrap: it sets no `on*=` and contains no URL sink. */
function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const target = process.argv[2];
  const file = target ? resolve(target) : fileURLToPath(new URL('../index.html', import.meta.url));
  const html = readFileSync(file, 'utf8');
  const result = checkIndexHtml(html);
  if (!result.ok) {
    console.error(`csp: FAILED (${target ?? 'index.html'})`);
    for (const problem of result.problems) console.error(`  · ${problem}`);
    process.exit(1);
  }
  console.log(`csp: OK (${result.hashes.length} inline script hash pinned) — ${target ?? 'index.html'}`);
  for (const hash of result.hashes) console.log(`  · ${hash}`);
}
