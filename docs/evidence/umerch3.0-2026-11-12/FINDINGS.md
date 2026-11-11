# UMERCH3.0 (local) — first assessment pass, 2026-11-12

**Target:** UMERCH3.0 (local), `http://127.0.0.1:8000/` · permission record AUTH-2026-0001 · scope `127.0.0.1:8000 /*`
**Method:** read-only HTTP requests (GET/HEAD) against the local copy, plus white-box review of the UMERCH3.0 source code.
No attacks, no data changes, no password guessing. Session cookies and secret values are redacted in the evidence files.

**Status of every finding: Pending verification.** In AIVERA, an assessor must review the evidence and confirm or reject each one.

| ID | Finding | Category | Suggested severity | Evidence |
|---|---|---|---|---|
| U-01 | Hard-coded administrator credentials in the login controller | Authentication | Critical | 05-source-excerpts.txt |
| U-02 | `/debug-env` exposes configuration without authentication | Information disclosure | Medium | 01-debug-env.txt, 05 |
| U-03 | Weak brute-force protection (10 s lockout) and optional reCAPTCHA | Authentication | Medium | 05 |
| U-04 | Plain-text password comparison fallback | Authentication | Medium | 05 |
| U-05 | Missing security headers, PHP version disclosed | Security configuration | Low | 02-home-headers.txt |
| U-06 | Inventory API is public and allows any origin (CORS `*`) | Access control | Low | 03-api-inventory.txt, 05 |
| U-07 | Session cookie `Secure` flag not enforced by default | Session management | Low | 02, 05 (config/session.php) |

## Details

### U-01 Hard-coded administrator credentials — Critical
`LoginCont::login()` checks for a fixed username and password before the normal login. If they match, it signs the visitor in as **Admin**, and creates the admin account if it doesn't exist. The values are in the source code (and therefore in the Git repository), so anyone with the code can take over the admin side.
- **Weakness:** CWE-798 Use of Hard-coded Credentials · OWASP Top 10 2021 A07 Identification and Authentication Failures
- **Fix:** delete the special case. Create the first admin with a seeder or an artisan command that reads a password from `.env`, store it hashed, and change the admin password anywhere this code has run.
- **To verify:** sign in to the local copy with the hard-coded values from the source and confirm you land on the admin side.

### U-02 `/debug-env` configuration disclosure — Medium
`GET /debug-env` needs no login and returns the database driver, host and name, `APP_ENV` and `APP_DEBUG`. On a production deployment this tells an attacker which database and environment they face, and whether debug mode is on.
- **Weakness:** CWE-200 Exposure of Sensitive Information · CWE-215 Insertion of Sensitive Information into Debugging Code · OWASP A05 Security Misconfiguration
- **Fix:** remove the route, or limit it to `APP_ENV=local` behind the admin login.

### U-03 Weak brute-force protection and optional reCAPTCHA — Medium
After 5 failed attempts in 60 seconds the account is locked for only **10 seconds**, which still allows about 25–30 guesses a minute per account. The limit is keyed on the username only, not the IP address. reCAPTCHA is only checked **if a token is sent**, so a script can simply leave it out.
- **Weakness:** CWE-307 Improper Restriction of Excessive Authentication Attempts · OWASP A07
- **Fix:** use Laravel's `RateLimiter` keyed on username + IP with increasing lockouts (for example 15 minutes after 5 failures), and make reCAPTCHA required when a site key is configured.

### U-04 Plain-text password comparison fallback — Medium
If a stored password does not start with the bcrypt prefix, the login compares it as plain text (`===`). Any account still holding a plain-text password stays valid, and the comparison is not constant-time.
- **Weakness:** CWE-256 Plaintext Storage of a Password · OWASP A02 Cryptographic Failures
- **Fix:** migrate any plain-text passwords to bcrypt once, then remove the fallback and always use `Hash::check`.

### U-05 Missing security headers — Low
Responses have no `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options` or `Referrer-Policy`, and `X-Powered-By: PHP/8.4.27` reveals the PHP version. (`Strict-Transport-Security` applies once the site is served over HTTPS.)
- **Weakness:** CWE-693 Protection Mechanism Failure · OWASP A05
- **Fix:** add a middleware that sets these headers, and set `expose_php = Off` in php.ini.

### U-06 Public inventory API with `Access-Control-Allow-Origin: *` — Low
`/api/inventory` and `/api/inventory/{productId}` return every inventory record without a login, and allow any website to read them. This is fine if stock levels are meant to be public; if not, it's a data exposure.
- **Weakness:** CWE-942 Permissive Cross-domain Policy · OWASP A01 Broken Access Control
- **Fix:** decide whether stock data is public. If not, require login. Either way, restrict CORS to UMERCH's own domain.

### U-07 Session cookie `Secure` flag not enforced — Low
`config/session.php` takes `secure` from `SESSION_SECURE_COOKIE`, which isn't set in `.env.example`. On an HTTPS deployment the session cookie could still be sent over plain HTTP. `HttpOnly` and `SameSite=Lax` are set correctly.
- **Weakness:** CWE-614 Sensitive Cookie Without 'Secure' Attribute · OWASP A05
- **Fix:** set `SESSION_SECURE_COOKIE=true` in production.

## Checks that passed
- **Exposed files:** `/.env`, `/.git/HEAD`, `/composer.json`, `/phpinfo.php` and `/vendor/autoload.php` return 404, and `/storage/logs/laravel.log` returns 403 (04-exposed-files.txt).
- **Session fixation:** the session ID is regenerated after a normal successful login (`$request->session()->regenerate()`).
- **Session cookie:** `laravel-session` is `HttpOnly` and `SameSite=Lax`.

## Automated scans run through AIVERA
- **SCN-0003, Nmap 7.993** (`-sT -sV --version-light -Pn`, ports 80, 443, 8000): port **8000/tcp open, http, PHP 8.4.27**; 80 and 443 closed. Stored in AIVERA as real data with the raw XML. This confirms the PHP version leak in U-05.
- SCN-0002 failed before starting (wrong Nmap path in the AIVERA settings), and was re-run as SCN-0003.
- SCN-0001 and FND-0001 to FND-0003 are **simulated practice data**, not evidence. Reject them in AIVERA.

- **SCN-0004, OWASP ZAP 2.17.0** (spider inside the approved scope, passive rules only): 9 findings (FND-0011 to FND-0019): missing CSP, missing anti-clickjacking header, missing Subresource Integrity, a cookie without HttpOnly (likely Laravel's XSRF-TOKEN, which is meant to be readable by JavaScript, so probably a false positive), X-Powered-By leak, missing X-Content-Type-Options, and 3 informational items. These independently confirm U-05.

## AI analyses (advisory, saved in AIVERA)
- **Vulnerability explanation of FND-0004 (U-01):** suggested severity critical, model confidence high. 7 values were redacted before sending.
- **Scan interpretation of SCN-0004 (ZAP):** summarised the missing hardening headers and recommended CSP and frame-ancestors / X-Frame-Options.
- Both were produced by the backup model **gemini-3.5-flash-lite**. The main model (gemini-3.6-flash) and gemini-3.5-flash returned "503 high demand" at the time, and AIVERA's fallback moved on automatically. Each saved analysis records the model and exactly what was sent.

## Not done yet
- Human verification in AIVERA: confirm or reject FND-0004 to FND-0019, and reject the simulated FND-0001 to FND-0003.
- Checks that need a signed-in UMERCH3.0 account (access control between customer and admin pages, OTP flow).
- Checks that need a signed-in UMERCH3.0 account (access control between customer and admin pages, OTP flow).
