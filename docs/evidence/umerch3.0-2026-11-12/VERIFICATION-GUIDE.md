# Verification guide: UMERCH3.0 findings (prepared 2026-11-12)

These are **recommendations, not decisions.** The brief requires the assessor to verify every finding, and AIVERA records the decision under your name. Read each one, do the quick check if you want to, then click the decision in AIVERA and paste the notes.

**How to use it in AIVERA:** Findings → open the finding → *Human verification* → **Confirm** / **Reject** / **Needs further review** → paste the *Notes* and *Reason* → tick "I reviewed the evidence" → save.

All live re-checks below were made on 2026-11-12 against the local copy at `http://127.0.0.1:8000` using read-only requests.

## Summary

| Finding | Title | Recommendation | Severity to keep |
|---|---|---|---|
| FND-0004 | Hard-coded administrator credentials | **Confirm** | Critical |
| FND-0005 | `/debug-env` exposes configuration | **Confirm** | Medium |
| FND-0006 | Weak brute-force protection, optional reCAPTCHA | **Confirm** | Medium |
| FND-0007 | Plain-text password comparison fallback | **Confirm** | Low (was Medium) |
| FND-0008 | Missing security headers (manual, combined) | **Reject: duplicate** | N/A |
| FND-0009 | Public inventory API with CORS `*` | **Confirm** | Low |
| FND-0010 | Session cookie Secure flag not enforced | **Confirm** | Low |
| FND-0011 | CSP header not set | **Confirm** | Medium |
| FND-0012 | Missing anti-clickjacking header | **Confirm** | Medium |
| FND-0013 | Subresource Integrity missing | **Reject: not applicable** | N/A |
| FND-0014 | Cookie without HttpOnly (`XSRF-TOKEN`) | **Reject: false positive** | N/A |
| FND-0015 | `X-Powered-By` leaks PHP version | **Confirm** | Low |
| FND-0016 | `X-Content-Type-Options` missing | **Confirm** | Low |
| FND-0017 | "Suspicious comments" in JS bundle | **Reject: false positive** | N/A |
| FND-0018 | "Modern Web Application" | **Reject: informational** | N/A |
| FND-0019 | "Session Management Response Identified" | **Reject: informational** | N/A |
| FND-0001 to 0003 | Simulated practice findings | **Reject** (or use *Reset simulated data*) | N/A |

Result: **10 confirmed** (1 critical, 4 medium, 5 low), **6 rejected**, plus the 3 simulated ones removed.

---

## Confirm

### FND-0004: Hard-coded administrator credentials · Critical
- **Why:** `LoginCont::login()` checks a fixed username and password before normal login, signs the visitor in as Admin, and creates `admin@umerch.com` if missing. The values are in the Git repository.
- **Quick check (1 min):** open `app/Http/Controllers/.../LoginCont.php` in UMERCH3.0 and find the `// user:admin` block. For a live check, sign in to your local copy at `http://127.0.0.1:8000/login` with the values from that file and confirm you reach the admin side.
- **Notes:** `Reviewed LoginCont::login() source: a hard-coded username/password check runs before normal authentication and logs the user in as Admin, creating admin@umerch.com if absent. Values are committed to the repository.`
- **Reason:** `Confirmed by source review; credentials are hard-coded and grant administrator access (CWE-798).`

### FND-0005: `/debug-env` configuration disclosure · Medium
- **Why:** re-checked live; `GET /debug-env` returns `db_connection`, `db_host`, `db_database`, `app_env`, `app_debug` with no login.
- **Quick check:** open `http://127.0.0.1:8000/debug-env` in a browser while signed out.
- **Notes:** `GET /debug-env without authentication returned JSON with DB connection, host, database name, APP_ENV and APP_DEBUG (re-checked 2026-11-12). Route defined in routes/web.php with no middleware.`
- **Reason:** `Reproduced manually; unauthenticated configuration disclosure (CWE-200). Medium because the route ships to production with the code.`

### FND-0006: Weak brute-force protection and optional reCAPTCHA · Medium
- **Why:** after 5 failures in 60 s the lockout is only 10 s, keyed on username only; reCAPTCHA is checked only when a token is sent.
- **Quick check:** read the rate limiter at the top of `login()` (`$rateLimitLockout = 10`) and the `if ($credentials['recaptcha_token'])` block.
- **Notes:** `Source review of LoginCont::login(): 5 attempts per 60 s then a 10 s lockout, keyed on the submitted username only; reCAPTCHA verification is skipped when no token is sent.`
- **Reason:** `Confirmed by source review; allows roughly 25 to 30 guesses per minute per account without a CAPTCHA (CWE-307).`

### FND-0007: Plain-text password comparison fallback · change severity to Low
- **Why:** the fallback exists in code, but every password currently stored in the local database is a bcrypt hash (checked 2026-11-12), so it is not exploitable today. It becomes exploitable if any plain-text password is ever written to the database.
- **Notes:** `Source review: login() compares non-bcrypt stored passwords with === (plain text). Checked the local users table: all stored passwords are bcrypt hashes, so no account is currently exposed.`
- **Reason:** `Confirmed as a code weakness (CWE-256); severity lowered to Low because no plain-text passwords exist in current data.`

### FND-0009: Public inventory API with CORS `*` · Low
- **Why:** `/api/inventory` returns all inventory records without login and sends `Access-Control-Allow-Origin: *`.
- **Ask the owner:** if stock levels are meant to be public, this stays Low (CORS only); if not, raise to Medium.
- **Notes:** `GET /api/inventory returned all inventory records without authentication with Access-Control-Allow-Origin: * (see evidence 03-api-inventory.txt).`
- **Reason:** `Confirmed; any website can read stock data from a visitor's browser (CWE-942). Low pending the owner's decision on whether stock data is public.`

### FND-0010: Session cookie Secure flag not enforced · Low
- **Why:** `config/session.php` reads `SESSION_SECURE_COOKIE`, which isn't set. HttpOnly and SameSite=Lax are correct.
- **Notes:** `config/session.php 'secure' => env('SESSION_SECURE_COOKIE'), not set in .env.example; observed laravel-session cookie without Secure.`
- **Reason:** `Confirmed configuration gap for HTTPS deployments (CWE-614).`

### FND-0011: Content-Security-Policy not set · Medium
- **Why:** re-checked live; no `Content-Security-Policy` header on `/`.
- **Quick check:** browser DevTools → Network → click the page → Response Headers.
- **Notes:** `Re-checked 2026-11-12: responses from / have no Content-Security-Policy header. Reported by OWASP ZAP plugin 10038.`
- **Reason:** `Reproduced; no CSP to limit script injection impact (CWE-693).`

### FND-0012: Missing anti-clickjacking header · Medium
- **Why:** re-checked live; neither `X-Frame-Options` nor CSP `frame-ancestors` is sent, so pages can be framed.
- **Notes:** `Re-checked 2026-11-12: no X-Frame-Options and no CSP frame-ancestors on /. Reported by OWASP ZAP plugin 10020.`
- **Reason:** `Reproduced; pages can be embedded in another site's frame (CWE-1021).`

### FND-0015: `X-Powered-By: PHP/8.4.27` · Low
- **Why:** re-checked live; the header reveals the exact PHP version (also seen by Nmap in SCN-0003).
- **Notes:** `Re-checked 2026-11-12: X-Powered-By: PHP/8.4.27 present on responses; Nmap SCN-0003 also identified PHP 8.4.27 on port 8000.`
- **Reason:** `Reproduced by two tools; version disclosure (CWE-497).`

### FND-0016: `X-Content-Type-Options` missing · Low
- **Why:** re-checked live; `nosniff` is not set on pages or assets.
- **Notes:** `Re-checked 2026-11-12: X-Content-Type-Options header absent on /, JS, CSS and SVG assets. Reported by OWASP ZAP plugin 10021.`
- **Reason:** `Reproduced; MIME sniffing not disabled (CWE-693).`

---

## Reject

### FND-0008: Missing security headers (manual) · duplicate
- **Notes:** `Same issues are covered individually, with tool evidence, by FND-0011 (CSP), FND-0012 (clickjacking), FND-0015 (X-Powered-By) and FND-0016 (X-Content-Type-Options).`
- **Reason:** `Duplicate of FND-0011, FND-0012, FND-0015 and FND-0016; rejected to avoid double counting in the report.`

### FND-0013: Subresource Integrity missing · not applicable
- **Why:** the flagged tag is the **Google Fonts** stylesheet (`fonts.googleapis.com/css2?...`). Google generates that CSS per browser, so a fixed integrity hash would break it; SRI can't be applied to it.
- **Notes:** `The only flagged resource is the Google Fonts CSS link, which is generated per user agent; SRI cannot be applied. Self-hosting the fonts would remove the third-party dependency.`
- **Reason:** `Not applicable / false positive for this resource. Recommendation recorded: self-host fonts.`

### FND-0014: Cookie without HttpOnly · false positive
- **Why:** re-checked live; the cookie is `XSRF-TOKEN`. Laravel deliberately makes it readable by JavaScript so the front end can send the CSRF token. The real session cookie `laravel-session` **has** HttpOnly.
- **Notes:** `Re-checked 2026-11-12: the flagged cookie is XSRF-TOKEN, which Laravel intentionally exposes to JavaScript for CSRF protection. laravel-session is set with HttpOnly.`
- **Reason:** `False positive: the cookie is designed to be readable by scripts and is not a session identifier.`

### FND-0017: Suspicious comments in JS bundle · false positive
- **Why:** ZAP (low confidence) matched the word "query". Re-checked the bundle `app-Cx6p3qNf.js`: there is no comment containing it; the match is ordinary minified library code.
- **Notes:** `Searched app-Cx6p3qNf.js for comments containing "query": none found. The match is minified code, not a developer comment.`
- **Reason:** `False positive (ZAP low-confidence pattern match).`

### FND-0018: "Modern Web Application" · informational
- **Notes:** `ZAP informational alert (plugin 10109) noting the site is a JavaScript application; it suggests using the Ajax Spider and describes no weakness.`
- **Reason:** `Informational only; not a vulnerability.`

### FND-0019: "Session Management Response Identified" · informational
- **Notes:** `ZAP informational alert (plugin 10112) identifying laravel-session as the session token; no weakness is described.`
- **Reason:** `Informational only; not a vulnerability.`

### FND-0001, FND-0002, FND-0003: simulated practice data
- **Reason:** `Simulated by the demo simulation (SCN-0001); not a real result.` Or remove them all at once with **Scan Center → Reset simulated data**.

---

## After verifying
- Confirmed findings get a **risk record** automatically. Review likelihood × impact in Risk Management if you disagree with the defaults.
- Create a **fix task** for each confirmed finding (finding page → *Risk & Remediation*). Start with FND-0004.
- Then **Reports → Create report** (Technical template) to produce the final report.
