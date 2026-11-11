/**
 * SYNTHETIC sample tool reports used by "Load synthetic sample" in the import
 * dialog. They follow the real Nmap XML / ZAP JSON shapes so the parsers can be
 * demonstrated, but every value is fictional. `{host}` and `{ip}` are replaced
 * with the selected target's host. One entry in each file is deliberately out
 * of scope to demonstrate scope filtering.
 */
export const SAMPLE_NMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!-- SYNTHETIC SAMPLE for AEGIS AI demo — not output from a real scan -->
<nmaprun scanner="nmap" args="nmap -sV -oX sample.xml {host}" version="7.95" xmloutputversion="1.05">
  <host>
    <status state="up" reason="syn-ack"/>
    <address addr="{ip}" addrtype="ipv4"/>
    <hostnames><hostname name="{host}" type="user"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="9.6p1"/></port>
      <port protocol="tcp" portid="80"><state state="open"/><service name="http" product="nginx" version="1.24.0"/></port>
      <port protocol="tcp" portid="443"><state state="open"/><service name="https" product="nginx" version="1.24.0"/></port>
      <port protocol="tcp" portid="5432"><state state="open"/><service name="postgresql" product="PostgreSQL DB" version="15.x"/></port>
      <port protocol="tcp" portid="8080"><state state="filtered"/><service name="http-proxy"/></port>
    </ports>
    <os><osmatch name="Linux 5.x (sample)" accuracy="90"/></os>
  </host>
  <host>
    <status state="up" reason="syn-ack"/>
    <address addr="203.0.113.250" addrtype="ipv4"/>
    <hostnames><hostname name="cdn.thirdparty.example" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="443"><state state="open"/><service name="https"/></port>
    </ports>
  </host>
</nmaprun>`;

export const SAMPLE_ZAP_JSON = JSON.stringify(
  {
    "@programName": "ZAP",
    "@version": "2.15.0",
    _note: "SYNTHETIC SAMPLE for AEGIS AI demo — not output from a real scan",
    site: [
      {
        "@name": "{origin}",
        alerts: [
          {
            pluginid: "10038",
            alert: "Content Security Policy (CSP) Header Not Set",
            name: "Content Security Policy (CSP) Header Not Set",
            riskcode: "2",
            confidence: "3",
            desc: "<p>Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks.</p>",
            solution: "<p>Ensure that your web server is configured to set the Content-Security-Policy header.</p>",
            reference: "<p>https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP</p>",
            cweid: "693",
            instances: [{ uri: "{origin}/", method: "GET", param: "", evidence: "" }],
          },
          {
            pluginid: "10010",
            alert: "Cookie No HttpOnly Flag",
            name: "Cookie No HttpOnly Flag",
            riskcode: "1",
            confidence: "2",
            desc: "<p>A cookie has been set without the HttpOnly flag, which means that the cookie can be accessed by JavaScript.</p>",
            solution: "<p>Ensure that the HttpOnly flag is set for all cookies.</p>",
            reference: "",
            cweid: "1004",
            instances: [{ uri: "{origin}/login", method: "POST", param: "sessionid", evidence: "Set-Cookie: sessionid" }],
          },
          {
            pluginid: "40012",
            alert: "Cross Site Scripting (Reflected)",
            name: "Cross Site Scripting (Reflected)",
            riskcode: "3",
            confidence: "2",
            desc: "<p>Cross-site Scripting (XSS) is an attack technique that involves echoing attacker-supplied code into a user's browser instance.</p>",
            solution: "<p>Use a vetted library or framework that does not allow this weakness to occur.</p>",
            reference: "",
            cweid: "79",
            instances: [{ uri: "{origin}/search?q=aegis-probe", method: "GET", param: "q", evidence: "<mark>aegis-probe</mark>" }],
          },
          {
            pluginid: "10096",
            alert: "Timestamp Disclosure - Unix",
            name: "Timestamp Disclosure - Unix",
            riskcode: "0",
            confidence: "1",
            desc: "<p>A timestamp was disclosed by the application/web server.</p>",
            solution: "<p>Manually confirm that the timestamp data is not sensitive.</p>",
            reference: "",
            cweid: "200",
            instances: [{ uri: "https://cdn.thirdparty.example/lib.js", method: "GET", param: "", evidence: "1731283200" }],
          },
        ],
      },
    ],
  },
  null,
  2,
);
