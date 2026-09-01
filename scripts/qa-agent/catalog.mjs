/**
 * Persistent Maestro test cases. Each entry maps to one Linear issue in
 * "QA Automation" — a case, not a single run.
 *
 * Keep flow paths as they live in the repo. Do not invent smoke/core/flow/feature
 * folders until new tests actually need them; CI still points at `.maestro/flows/`.
 */

export const QA_PROJECT = "QA Automation";
export const QA_TEAM = "Finla";
export const FOUNDER_TASKS_PROJECT = "Founder Tasks";

export const RESULT_LABELS = Object.freeze(["Pass", "Fail", "Flaky"]);
export const TEST_TYPE_LABELS = Object.freeze(["Smoke", "Core", "Flow", "Feature Test"]);

export const TEST_CASES = Object.freeze([
  {
    key: "smoke-p0",
    title: "[Smoke] Login → sohbet → menü → faturalar → çıkış",
    testType: "Smoke",
    suite: "smoke",
    flow: ".maestro/flows/smoke.yaml",
    screens: "login, chat, side menu, outgoing invoices, logout",
    summary:
      "P0 path: launch the app, skip onboarding, log in, send a chat message, open the side menu, open Faturalarım, log out.",
  },
  {
    key: "core-login",
    title: "[Core] Telefon + PIN ile giriş",
    testType: "Core",
    suite: "core",
    flow: ".maestro/flows/login.yaml",
    screens: "onboarding skip, login, chat",
    summary: "Launch, skip onboarding, log in with TEST_PHONE / TEST_PIN, reach the chat input.",
  },
  {
    key: "core-chat",
    title: "[Core] Sohbete mesaj gönderimi ve asistan yanıtı",
    testType: "Core",
    suite: "core",
    flow: ".maestro/flows/chat-send.yaml",
    screens: "login, chat",
    summary: "Log in, send a chat message, wait until the assistant replies.",
  },
  {
    key: "core-menu",
    title: "[Core] Yan menü ve sohbet listesi",
    testType: "Core",
    suite: "core",
    flow: ".maestro/flows/menu.yaml",
    screens: "login, chat, side menu",
    summary: "Log in, open the side menu, wait until conversations load.",
  },
  {
    key: "core-invoices",
    title: "[Core] Faturalarım listesi",
    testType: "Core",
    suite: "core",
    flow: ".maestro/flows/invoices.yaml",
    screens: "login, chat, side menu, outgoing invoices",
    summary: "Log in, open the menu, navigate to Faturalarım (outgoing invoices).",
  },
  {
    key: "core-logout",
    title: "[Core] Çıkış",
    testType: "Core",
    suite: "core",
    flow: ".maestro/flows/logout.yaml",
    screens: "login, chat, logout",
    summary: "Log in, log out, land back on the login screen.",
  },
]);

export function maestroFlowMarker(flow) {
  return `**Maestro flow:** \`${flow}\``;
}

export function parseMaestroFlow(description) {
  const text = String(description ?? "");
  // Linear's editor sometimes inserts a space before the closing **.
  const marked = text.match(/\*\*Maestro flow:\s*\*\*\s*`([^`]+)`/i);
  if (marked) return marked[1];
  const fallback = text.match(/`(\.maestro\/[^`]+)`/);
  return fallback ? fallback[1] : null;
}

export function buildIssueDescription(testCase) {
  return [
    testCase.summary,
    "",
    `**Screens / flow:** ${testCase.screens}`,
    "",
    maestroFlowMarker(testCase.flow),
    "",
    "Persistent test case (not a single run). The local QA runner updates the Result label and comments after each execution.",
  ].join("\n");
}

export function matchIssueToCase(issue, catalog = TEST_CASES) {
  const flow = parseMaestroFlow(issue?.description);
  if (flow) {
    const byFlow = catalog.find((entry) => entry.flow === flow);
    if (byFlow) return byFlow;
  }
  return catalog.find((entry) => entry.title === issue?.title) ?? null;
}

export function findCase({ key, flow, catalog = TEST_CASES } = {}) {
  if (key) {
    const found = catalog.find((entry) => entry.key === key);
    if (!found) throw new Error(`Unknown test case key "${key}".`);
    return found;
  }
  if (flow) {
    const found = catalog.find((entry) => entry.flow === flow);
    if (!found) throw new Error(`No catalog entry for flow "${flow}".`);
    return found;
  }
  throw new Error("Provide --key or --flow to select a test case.");
}
