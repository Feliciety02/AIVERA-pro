/**
 * Step-by-step guides shown inside popups the first time they open.
 * Each step outlines one field (CSS selector inside the popup) and explains it in plain words.
 */
import type { GuideStep } from "@/components/shared/DialogGuide";

export const DIALOG_GUIDES = {
  toolImport: [
    { title: "Bring in real tool results", body: "Use this when you ran a security tool yourself (Nmap or OWASP ZAP) on a website you have permission to test. AIVERA reads the report file; it does not run the tool for you." },
    { target: "#imp-target", title: "1. Pick the website", body: "Only websites with confirmed permission that belong to a project are listed. The report is checked against this website's scope." },
    { target: "[data-guide=imp-format]", title: "2. Choose the report type", body: "Nmap XML lists computers, open ports and services. ZAP JSON lists web problems such as missing security headers or injection. Pick the one that matches your file." },
    { target: "[data-guide=imp-file]", title: "3. Add the report", body: "Click “Choose file…” to upload it, or paste its text in the box below. No report yet? “Load synthetic sample” fills in a practice report for this website." },
    { target: "[data-guide=imp-submit]", title: "4. Preview, then import", body: "“Parse & preview” shows what will be added and lists anything outside the scope that will be skipped. Imported findings start as Pending Verification until a person checks them." },
  ],
  remediationTask: [
    { title: "One fix task", body: "Everything about fixing one confirmed vulnerability: what to do, who is doing it, and proof that it was fixed." },
    { target: "[data-guide=rem-progress]", title: "Where it is", body: "To do → Fixing → Retest → Done. The highlighted step is where the fix is now." },
    { target: "[data-guide=rem-actions]", title: "What to do next", body: "One sentence says what happens next and who does it, with the button for it. “Accept risk” records that the owner chose not to fix it, with a reason." },
    { target: "[data-guide=rem-recommendation]", title: "How to fix it", body: "The change the website owner should make." },
    { target: "[data-guide=rem-before-after]", title: "Details", body: "Who owns the fix, the retest result, the original finding and the due date." },
    { target: "[data-guide=rem-timeline]", title: "History", body: "Every step with who made it and their note. Open it when you need it." },
  ],
  scopeEdit: [
    { title: "Change what may be tested", body: "Update the scope when the owner's permission changes. Every change is saved in the activity log." },
    { target: "#scope-hosts", title: "Hosts", body: "The exact website addresses that may be tested. Anything not listed is off limits." },
    { target: "#scope-allowed", title: "Allowed paths", body: "Parts of the website that may be tested. /* means the whole site." },
    { target: "#scope-excluded", title: "Never tested", body: "Paths that must be skipped even inside an allowed path, for example payment pages the owner asked you to avoid." },
    { target: "[data-guide=scope-categories]", title: "Test categories", body: "Only checked types of tests can be scanned, imported or recorded for this website." },
  ],
  recordAuthorization: [
    { title: "Confirm permission", body: "Only do this after the owner has given written permission. Your name and the time are recorded, and testing is unlocked." },
    { target: "#auth-confirm", title: "Tick to confirm", body: "By ticking, you take responsibility that permission exists for this website." },
  ],
  userEditor: [
    { title: "Manage a user", body: "Choose what this person can do in AIVERA." },
    { target: "[aria-label=Role]", title: "Role", body: "Administrator: leads the assessment, approves and manages the team. Security tester: scans, verifies and drafts reports. Website owner: owns the tested website and works on the fixes assigned to them." },
    { target: "[aria-label='Account status']", title: "Account status", body: "Suspended users can't sign in. Invited users haven't signed in yet." },
    { target: "[data-guide=user-projects]", title: "Projects", body: "The assessments this person works on. They can be assigned findings and checklists in these projects." },
  ],
} satisfies Record<string, GuideStep[]>;
