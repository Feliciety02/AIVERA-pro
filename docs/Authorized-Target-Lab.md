# Authorized Target Assessment Lab

## Scope and authorization

Use only an application approved by the instructor or system owner. Record the exact URL, host, port, allowed paths, excluded paths, permitted activities, testing window, test accounts, and proof of authorization. The target must be reachable by the AIVERA API host and any tool container. A URL such as `localhost` inside a container points to that container, so use an address that actually reaches the approved target from the assessment worker.

## Repeatable demonstration

1. Install Nmap and Docker on a dedicated assessment machine. Pull `ghcr.io/zaproxy/zaproxy:stable` and record the exact tool and image versions.
2. Deploy the approved target in an isolated lab or use its approved staging address. Confirm reachability from the assessment worker without scanning anything else.
3. Start AIVERA in API mode with its database. Set `AIVERA_LIVE_SCANS_ENABLED=true` and `AIVERA_ALLOWED_SCAN_HOSTS` to the exact approved host. Register the target and attach the authorization reference. In the scope, tick **Port and service discovery** to allow Nmap and **Automated web scanning (rate-limited)** to allow ZAP.
4. Run a Passive or Baseline assessment with the permitted tools. Capture the queued, running, and completed states, and retain the raw Nmap XML and ZAP JSON shown in scan details.
5. Review pending findings and their evidence. Independently reproduce selected observations within scope, then confirm or reject them with notes and an evidence review record. AI interpretation and remediation drafts remain advisory.
6. Generate the final report from verified findings. Check its scope, methodology, tool versions, evidence, risk ratings, recommendations, and provenance statement. Keep simulated findings out of the final assessment report.

## Evidence to submit

| Deliverable | Evidence to retain |
| --- | --- |
| Approved scope | Authorization record, exact target URL and host, paths, exclusions, permitted activities, test accounts |
| System design | Architecture diagram, database model, scan and verification workflow, adapter interface |
| Tool integration | Tool versions, configuration, timestamps, raw output, scope skip log |
| AI integration | Two different generated functions, redacted context, model version, limitations, assessor decision |
| Security findings | At least three honestly assessed categories, requests or responses or tool output, reproduction notes, severity and remediation |
| Final report | PDF based on real or clearly attributed imported evidence, with no demonstration data mixed in |
| Presentation | Each member's contribution and a working end-to-end demonstration |

## Current limits

The live adapters have not been exercised in this workspace because Docker and Nmap are absent. Background jobs currently run inside the API process and do not resume after a restart. Nmap is a local subprocess; ZAP is containerized. ZAP spider depth, children, threads, and duration are bounded, but the requests-per-second setting is not enforced by this adapter. Only passive ZAP checks are automated. Authenticated scanning, active testing, recurring schedules, and non-web adapters still require implementation and testing. Keep the live scan gate off outside a dedicated authorized lab.
