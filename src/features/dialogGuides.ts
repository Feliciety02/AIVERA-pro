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
  manualFinding: [
    { title: "Write down a problem you found", body: "Use this when you found an issue yourself while testing by hand. Recording it does not confirm it — it goes into the queue as Pending Verification." },
    { target: "#mf-target", title: "1. Which website?", body: "Choose the website where you saw the problem. Only websites with confirmed permission inside a project are listed." },
    { target: "#mf-title", title: "2. Short title", body: "One line that says what is wrong, for example “Customer can view another customer's order”." },
    { target: "#mf-cat", title: "3. Category and severity", body: "The category is the type of problem (login, access control, injection…). Severity is how serious it is: Critical is worst, Info is just a note." },
    { target: "#mf-asset", title: "4. Where exactly", body: "The page or address where it happens, e.g. /orders/1043. Add the parameter (the input name) if one is involved." },
    { target: "#mf-desc", title: "5. Explain it", body: "Describe what happens, why it is a problem (impact), and how it could be fixed (remediation). Plain language is fine." },
    { target: "#mf-ev", title: "6. Add proof", body: "Paste the steps you followed and what you saw, such as the request and response. Remove passwords or tokens first — reviewers decide based on this proof." },
  ],
  verification: [
    { title: "Make a human decision", body: "This is where a person decides whether a finding is real. Tools and AI only suggest — your decision is what counts in reports and metrics." },
    { target: "#v-notes", title: "1. How you checked", body: "Write how you verified it: what you tried, what happened, and in which environment. Someone else should be able to repeat it." },
    { target: "#v-reason", title: "2. Why this decision", body: "One sentence on why, e.g. “Reproduced manually” or “False positive — the page already escapes input”." },
    { target: "#v-reviewed", title: "3. Evidence reviewed", body: "Tick this to confirm you actually looked at the evidence attached to the finding. Confirming requires it." },
    { target: "[data-guide=v-submit]", title: "4. Save", body: "Confirming asks once more before saving, because a confirmed finding becomes a risk record and can go in the final report. You can change the decision later; every change is kept in the history." },
  ],
  remediationCreate: [
    { title: "Plan the fix", body: "A fix task tells the website owner what to change, who is responsible and by when. It is only closed after a person approves it." },
    { target: "#r-title", title: "1. Title and description", body: "Already filled in from the finding. Adjust them so the owner understands what is broken." },
    { target: "#r-rec", title: "2. How to fix it", body: "The recommended change. You can paste an AI suggestion here, but review it first — you are responsible for the advice." },
    { target: "#r-owner", title: "3. Owner", body: "The person who will make the fix. They see it in their task list." },
    { target: "#r-priority", title: "4. Priority and due date", body: "Pre-set from the severity. Overdue tasks send a notification and show in red." },
    { target: "[aria-label='Require retest']", title: "5. Retest", body: "Keep this on so someone must test again after the fix. The task can only be resolved after a passed retest." },
  ],
  remediationEdit: [
    { title: "Edit the fix task", body: "Change the text, owner, priority or due date. The status is changed with the workflow buttons, not here." },
    { target: "#re-owner", title: "Owner and priority", body: "Reassign the task or raise its priority if the risk changed." },
    { target: "#re-due", title: "Due date", body: "Move the deadline if the owner agreed a new date. Overdue tasks are flagged automatically." },
  ],
  remediationTask: [
    { title: "One fix task", body: "Everything about fixing one confirmed vulnerability: what to do, who is doing it, and proof that it was fixed." },
    { target: "[data-guide=rem-actions]", title: "Move the task forward", body: "Use the buttons in order: Start work → Request retest → Record retest passed/failed → Approve & resolve. “Accept risk” records that the owner chose not to fix it, with a reason." },
    { target: "[data-guide=rem-recommendation]", title: "What to change", body: "The fix the owner should make." },
    { target: "[data-guide=rem-before-after]", title: "Before and after", body: "Before: the finding as it was discovered. After: the result of the retest. This is your proof the fix worked." },
    { target: "[data-guide=rem-timeline]", title: "History", body: "Every status change with who made it and their note." },
  ],
  remediationAction: [
    { title: "Add a note", body: "Each step in a fix needs a short note: what was deployed, how you retested, or why the risk is accepted. It is saved in the task history." },
    { target: "[aria-label=Notes]", title: "Your note", body: "At least a few words. For a retest, describe what you tried and what happened." },
  ],
  riskEditor: [
    { title: "Adjust the risk", body: "The risk score ranks confirmed problems so the worst are fixed first. Score = likelihood × impact, from 1 to 25." },
    { target: "#rk-l", title: "Likelihood", body: "How likely an attacker is to find and use this problem (1 = unlikely, 5 = very likely)." },
    { target: "#rk-i", title: "Impact", body: "How bad it would be if they did (1 = minor, 5 = severe, e.g. all customer data exposed). The score above updates as you change these." },
    { target: "#rk-o", title: "Owner", body: "Who is responsible for managing this risk." },
    { target: "#rk-m", title: "Status", body: "Open, being mitigated, mitigated (fixed), or accepted (owner decided to live with it)." },
    { target: "#rk-d", title: "Review date and notes", body: "When to look at this risk again, and any reasoning for your changes." },
  ],
  scopeEdit: [
    { title: "Change what may be tested", body: "Update the scope when the owner's permission changes. Every change is saved in the activity log." },
    { target: "#scope-hosts", title: "Hosts", body: "The exact website addresses that may be tested. Anything not listed is off limits." },
    { target: "#scope-allowed", title: "Allowed paths", body: "Parts of the website that may be tested. /* means the whole site." },
    { target: "#scope-excluded", title: "Never tested", body: "Paths that must be skipped even inside an allowed path — for example payment pages the owner asked you to avoid." },
    { target: "[data-guide=scope-categories]", title: "Test categories", body: "Only checked types of tests can be scanned, imported or recorded for this website." },
  ],
  recordAuthorization: [
    { title: "Confirm permission", body: "Only do this after the owner has given written permission. Your name and the time are recorded, and testing is unlocked." },
    { target: "#auth-confirm", title: "Tick to confirm", body: "By ticking, you take responsibility that permission exists for this website." },
  ],
  userEditor: [
    { title: "Manage a user", body: "Choose what this person can do in AIVERA." },
    { target: "[aria-label=Role]", title: "Role", body: "Administrator: everything. Security assessor: plan, test, verify and report. Viewer: read dashboards and final reports only." },
    { target: "[aria-label='Account status']", title: "Account status", body: "Suspended users can't sign in. Invited users haven't signed in yet." },
    { target: "[data-guide=user-projects]", title: "Projects", body: "The assessments this person works on. They can be assigned findings and checklists in these projects." },
  ],
} satisfies Record<string, GuideStep[]>;
