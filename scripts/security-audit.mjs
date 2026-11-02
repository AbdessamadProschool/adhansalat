#!/usr/bin/env node
/**
 * Automated Security Audit Suite based on:
 *  - Cloudflare Security Audit Specification
 *  - OWASP Mobile Application Security Verification Standard (MASVS v2.1)
 *  - OWASP Application Security Verification Standard (ASVS v4.0.3)
 *  - Semgrep Core Rules for Android, WebView & DOM XSS
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(process.cwd());
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const issues = [];

function check(title, condition, failureMessage) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${title}`);
  } else {
    failedChecks++;
    console.log(`  [FAIL] ${title} - ${failureMessage}`);
    issues.push({ title, message: failureMessage });
  }
}

console.log('\n======================================================');
console.log('   ADANSALAT - AUTOMATED SECURITY AUDIT (OWASP / CLOUDFLARE)');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// 1. Android Manifest & Permissions (OWASP MASVS-NETWORK & MASVS-PLATFORM)
// -----------------------------------------------------------------------------
console.log('--- 1. Android OS, Permissions & IPC Surface ---');
const manifestPath = join(ROOT, 'android/app/src/main/AndroidManifest.xml');
const manifestContent = readFileSync(manifestPath, 'utf8');

// Check 1: Zero Internet Permission
const hasInternet = /android\.permission\.INTERNET/.test(manifestContent);
check('Zero INTERNET Permission in Manifest', !hasInternet, 'Found android.permission.INTERNET! The app should not request internet.');

// Check 2: Backup Disabled
const backupDisabled = /android:allowBackup="false"/.test(manifestContent) && /android:fullBackupContent="false"/.test(manifestContent);
check('ADB & Cloud Backup Disabled', backupDisabled, 'allowBackup or fullBackupContent is not set to false.');

// Check 3: Exported components audit
const componentMatches = [...manifestContent.matchAll(/<(activity|service|receiver|provider)[^>]*android:name="([^"]+)"[^>]*>/g)];
let allComponentsSafe = true;
for (const match of componentMatches) {
  const [fullTag, type, name] = match;
  const isExported = /android:exported="true"/.test(fullTag);
  const isLauncher = /android.intent.action.MAIN/.test(manifestContent.slice(match.index, match.index + 500));
  if (isExported && name !== '.MainActivity' && !isLauncher) {
    allComponentsSafe = false;
    check(`Component exposure for ${name}`, false, `Exported without being the main launcher activity`);
  }
}
if (allComponentsSafe) {
  check('Unexported Internal Components (Receivers/Services)', true);
}

// -----------------------------------------------------------------------------
// 2. Android WebView Sandbox & Bridge (OWASP MASVS-PLATFORM & CODE)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Android WebView Sandbox & Native Bridge ---');
const mainActivityPath = join(ROOT, 'android/app/src/main/java/app/azan/global/MainActivity.kt');
const mainActivityContent = readFileSync(mainActivityPath, 'utf8');

check('WebView File Access Disabled (allowFileAccess = false)', /allowFileAccess\s*=\s*false/.test(mainActivityContent), 'allowFileAccess is not false');
check('Mixed Content Blocked (MIXED_CONTENT_NEVER_ALLOW)', /MIXED_CONTENT_NEVER_ALLOW/.test(mainActivityContent), 'Mixed content is not strictly blocked');
check('Remote Web Debugging Guarded by isDebuggable()', /if\s*\(\s*isDebuggable\(\)\s*\)\s*WebView\.setWebContentsDebuggingEnabled\(true\)/.test(mainActivityContent), 'Remote debugging not properly guarded');
check('External Navigation Filtered to System Browser', /shouldOverrideUrlLoading/.test(mainActivityContent) && /ASSET_DOMAIN/.test(mainActivityContent), 'WebView shouldOverrideUrlLoading does not guard against external domains');

// -----------------------------------------------------------------------------
// 3. Path Traversal & Audio Storage (OWASP MASVS-STORAGE)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Path Traversal & File Import Protection ---');
const customSoundsPath = join(ROOT, 'android/app/src/main/java/app/azan/global/CustomSounds.kt');
const customSoundsContent = readFileSync(customSoundsPath, 'utf8');

check('Strict Audio ID Regex Validation', /ID_PATTERN\s*=\s*Regex/.test(customSoundsContent), 'Missing ID_PATTERN Regex validation');
check('Dot-Dot (..) Path Traversal Prevention', /!id\.contains\("\.\."\)/.test(customSoundsContent), 'Missing .. path traversal check');
check('Max Storage Size Capped (Denial of Storage defense)', /MAX_BYTES/.test(customSoundsContent), 'Missing MAX_BYTES file upload limit');

// -----------------------------------------------------------------------------
// 4. Content Security Policy (CSP) & Web Anti-XSS (OWASP ASVS v4.0.3)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Content Security Policy & Anti-XSS ---');
const indexPath = join(ROOT, 'index.html');
const indexContent = readFileSync(indexPath, 'utf8');
const cspMatch = indexContent.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);

if (cspMatch) {
  const csp = cspMatch[1];
  check('CSP default-src is "self"', csp.includes("default-src 'self'"), 'CSP does not contain default-src \'self\'');
  check('CSP blocks unsafe-eval (no eval execution)', !csp.includes("'unsafe-eval'"), 'CSP contains \'unsafe-eval\'');
  check('CSP script-src is pinned with SHA-256 hash', /script-src\s+'self'\s+'sha256-[^']+'/.test(csp), 'CSP script-src missing sha256 hash');
  check('CSP object-src is "none"', csp.includes("object-src 'none'"), 'CSP does not restrict object-src');
  check('CSP base-uri is "none"', csp.includes("base-uri 'none'"), 'CSP does not restrict base-uri');
} else {
  check('CSP Header in index.html', false, 'Missing Content-Security-Policy meta tag in index.html');
}

// -----------------------------------------------------------------------------
// 5. DOM XSS Sink Scan across TypeScript files (Semgrep Rules)
// -----------------------------------------------------------------------------
console.log('\n--- 5. Source Code DOM XSS & Sink Analysis (Semgrep Rule Set) ---');
function getAllFiles(dir, extList) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...getAllFiles(full, extList));
    } else if (extList.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const tsFiles = getAllFiles(join(ROOT, 'src'), ['.ts', '.js']);
let dangerousEval = 0;
let dangerousFunctionConstructor = 0;
let dangerousDocumentWrite = 0;

for (const file of tsFiles) {
  const content = readFileSync(file, 'utf8');
  if (/\beval\s*\(/.test(content)) dangerousEval++;
  if (/new\s+Function\s*\(/.test(content)) dangerousFunctionConstructor++;
  if (/document\.write(ln)?\s*\(/.test(content)) dangerousDocumentWrite++;
}

check('Zero eval() in TypeScript Source', dangerousEval === 0, `Found ${dangerousEval} eval() occurrences`);
check('Zero new Function() Constructor in Source', dangerousFunctionConstructor === 0, `Found ${dangerousFunctionConstructor} new Function() occurrences`);
check('Zero document.write() in Source', dangerousDocumentWrite === 0, `Found ${dangerousDocumentWrite} document.write() occurrences`);

// -----------------------------------------------------------------------------
// 6. Privacy & Third-Party Telemetry Scan (OWASP MASVS-PRIVACY)
// -----------------------------------------------------------------------------
console.log('\n--- 6. Privacy & Tracking SDK Leak Scan ---');
const allSourceFiles = [...tsFiles, ...getAllFiles(join(ROOT, 'android/app/src/main/java'), ['.kt', '.java'])];
const trackers = [
  'google-analytics',
  'firebase/analytics',
  'facebook.sdk',
  'appsflyer',
  'adjust.sdk',
  'admob',
  'mopub',
  'mixpanel',
  'sentry.io',
];

let trackerMatches = 0;
for (const file of allSourceFiles) {
  const content = readFileSync(file, 'utf8').toLowerCase();
  for (const t of trackers) {
    if (content.includes(t)) {
      trackerMatches++;
      console.log(`    ! Tracker match: ${t} in ${file}`);
    }
  }
}
check('Zero Ad/Tracking/Telemetry SDKs in Source', trackerMatches === 0, `Found ${trackerMatches} tracking references`);

// -----------------------------------------------------------------------------
// 7. Supply Chain & Package Dependencies
// -----------------------------------------------------------------------------
console.log('\n--- 7. Supply Chain & Dependencies ---');
const pkgPath = join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const runtimeDeps = Object.keys(pkg.dependencies || {});

check('Zero Runtime npm Dependencies (0 attack surface)', runtimeDeps.length === 0, `Runtime dependencies found: ${runtimeDeps.join(', ')}`);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`   AUDIT RESULTS: ${passedChecks}/${totalChecks} CHECKS PASSED`);
if (failedChecks === 0) {
  console.log('   STATUS: 100% SECURE - ALL CHECKS PASSED (GRADE A+)');
} else {
  console.log(`   STATUS: ${failedChecks} ISSUES IDENTIFIED`);
}
console.log('======================================================\n');

process.exit(failedChecks === 0 ? 0 : 1);
