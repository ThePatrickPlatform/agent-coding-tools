// Enforces the Jira site policy for Claude Code and GitHub Copilot CLI.
//
// Runs as a PreToolUse hook on Jira MCP tools and shell commands, and as a
// PostToolUse hook to remember issues the agent created. Both tools send the
// same payload and accept the same decision output for plugin hooks.
//
// The policy file maps each Jira site to a profile. Without a policy file,
// nothing is restricted. See skills/jira/references/site-policy.md.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const POLICY_FILE =
  process.env.JIRA_POLICY_FILE ?? path.join(os.homedir(), ".agent-coding-tools", "jira-policy.json");

const DEFAULT_LOCKED_TYPES = ["Story", "Epic"];
const DEFAULT_EDITABLE_FIELDS = ["assignee"];
const PROFILES = ["full", "read-only", "story-content-locked"];

const MCP_WRITES = {
  createJiraIssue: (input) => ({ kind: "create", issueType: input.issueTypeName }),
  editJiraIssue: (input) => ({ kind: "edit", key: input.issueIdOrKey, fields: Object.keys(input.fields ?? {}) }),
  transitionJiraIssue: () => ({ kind: "transition" }),
  addCommentToJiraIssue: () => ({ kind: "comment" }),
  createIssueLink: () => ({ kind: "link" }),
  addWorklogToJiraIssue: () => ({ kind: "worklog" }),
};
const WRITE_VERB = /^(create|edit|update|delete|remove|add|transition|assign|move|archive)/i;

const ACLI_READ_VERBS = new Set(["view", "search", "list", "type", "status", "get", "count", "help"]);
const ACLI_EDIT_FLAGS = {
  "--summary": "summary", "-s": "summary",
  "--description": "description", "--description-file": "description", "-d": "description",
  "--labels": "labels", "-l": "labels", "--remove-labels": "labels",
  "--type": "issuetype", "-t": "issuetype",
  "--assignee": "assignee", "-a": "assignee", "--remove-assignee": "assignee",
};
const ACLI_NEUTRAL_FLAGS = new Set(["--yes", "-y", "--json", "--key", "-k", "--jql", "--filter", "--help", "-h"]);

const REST_HOST = /([a-z0-9-]+\.atlassian\.net)|api\.atlassian\.com\/ex\/jira\/([\w-]+)/i;
const REST_WRITE = /(-X|--request|-Method)\s*['"]?(POST|PUT|PATCH|DELETE)\b|\s(-d|--data[\w-]*|--json|-F|--form|-Body)\s/i;

// ---- Classify a tool call into a Jira write action, or null -------------

export function classify(toolName, toolInput) {
  if (toolName === "Bash" || toolName === "PowerShell") return classifyShell(String(toolInput?.command ?? ""));
  const tool = toolName.split(/__|-/).pop();
  const input = toolInput ?? {};
  const site = input.cloudId;
  if (MCP_WRITES[tool]) return [{ ...MCP_WRITES[tool](input), site }];
  if (/Jira|IssueLink/.test(tool) && WRITE_VERB.test(tool)) return [{ kind: "unknown-write", site }];
  return [];
}

function classifyShell(command) {
  const actions = [];
  for (const segment of command.split(/[;&|\n]+/)) {
    const acli = segment.match(/\bacli(?:\.exe)?\s+jira\s+(.*)/i);
    if (acli) {
      const action = classifyAcli(tokenize(acli[1]));
      if (action) actions.push({ ...action, site: "acli" });
    } else if (REST_HOST.test(segment) && REST_WRITE.test(segment)) {
      const [, host, cloudId] = segment.match(REST_HOST);
      actions.push({ kind: "rest-write", site: host ?? cloudId });
    }
  }
  return actions;
}

function classifyAcli(tokens) {
  const [group, verb, sub] = tokens;
  const flags = tokens.filter((t) => t.startsWith("-"));
  const flagValue = (...names) => {
    const i = tokens.findIndex((t) => names.includes(t));
    return i >= 0 ? tokens[i + 1] : undefined;
  };
  if (group !== "workitem") {
    return verb && !ACLI_READ_VERBS.has(verb) && WRITE_VERB.test(verb) ? { kind: "unknown-write" } : null;
  }
  switch (verb) {
    case "create":
      return { kind: "create", issueType: flags.includes("--from-json") ? undefined : flagValue("--type", "-t") };
    case "create-bulk":
    case "clone":
      return { kind: "create", issueType: undefined };
    case "edit": {
      const fields = flags.filter((f) => !ACLI_NEUTRAL_FLAGS.has(f)).map((f) => ACLI_EDIT_FLAGS[f] ?? "other fields");
      const bulk = flags.includes("--jql") || flags.includes("--filter");
      return { kind: "edit", key: flagValue("--key", "-k"), fields, bulk };
    }
    case "assign":
      return { kind: "assign" };
    case "transition":
      return { kind: "transition" };
    case "comment":
      return ACLI_READ_VERBS.has(sub) ? null : { kind: "comment" };
    case "link":
      return ACLI_READ_VERBS.has(sub) ? null : { kind: "link" };
    case "delete":
    case "archive":
      return { kind: "delete" };
    default:
      return ACLI_READ_VERBS.has(verb) ? null : { kind: "unknown-write" };
  }
}

function tokenize(text) {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

// ---- Decide -------------------------------------------------------------

export function siteRule(policy, site) {
  const id = String(site ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const [host, rule] =
    (id &&
      Object.entries(policy.sites ?? {}).find(
        ([host, rule]) => host.toLowerCase() === id || String(rule.cloudId ?? "").toLowerCase() === id,
      )) ||
    [];
  const resolved = rule ?? { profile: policy.default ?? "read-only" };
  return {
    host: host ?? (id || "an unidentified site"),
    profile: resolved.profile,
    lockedTypes: (resolved.lockedTypes ?? DEFAULT_LOCKED_TYPES).map((t) => t.toLowerCase()),
    editableFields: resolved.editableFields ?? DEFAULT_EDITABLE_FIELDS,
  };
}

export function decide(action, rule, createdKeys) {
  const where = `${rule.host} (${rule.profile} in ${POLICY_FILE})`;
  if (!PROFILES.includes(rule.profile)) {
    return deny(`Unknown Jira policy profile "${rule.profile}" for ${rule.host}. Fix ${POLICY_FILE}.`);
  }
  if (rule.profile === "full") return null;
  if (rule.profile === "read-only") {
    return deny(`Jira site ${where} is read-only. Do not retry. Tell the user what you would have changed.`);
  }

  const locked = rule.lockedTypes.join(", ");
  switch (action.kind) {
    case "comment":
    case "link":
    case "assign":
    case "transition":
    case "worklog":
      return null;
    case "create":
      if (!action.issueType) {
        return ask(`Cannot tell the issue type being created on ${where}. Creating ${locked} is not allowed there.`);
      }
      return rule.lockedTypes.includes(action.issueType.toLowerCase())
        ? deny(`Creating a ${action.issueType} is not allowed on ${where}; only the product owner creates ${locked}. Create a Task instead, or draft it for the product owner.`)
        : null;
    case "edit": {
      const content = action.fields.filter((f) => !rule.editableFields.includes(f));
      if (content.length === 0) return null;
      if (action.bulk) return deny(`Bulk edits of ${content.join(", ")} are not allowed on ${where}.`);
      if (action.key && createdKeys.includes(action.key)) return null;
      return ask(
        `${action.key ?? "This issue"} may be a ${locked}; their content (${content.join(", ")}) is locked on ${where}. ` +
          `Only approve if it is not a ${locked}. Otherwise add a comment proposing the change for the product owner.`,
      );
    }
    case "delete":
      return deny(`Deleting or archiving issues is not allowed on ${where}.`);
    case "rest-write":
      return deny(`Writes through the REST API are not allowed on ${where}. Use the Atlassian MCP server or acli.`);
    default:
      return ask(`This Jira change on ${where} is not covered by the policy. Approve only if it does not change ${locked} content.`);
  }
}

function deny(reason) {
  return { permissionDecision: "deny", permissionDecisionReason: reason };
}

function ask(reason) {
  return { permissionDecision: "ask", permissionDecisionReason: reason };
}

// Returns the strictest decision for a tool call, or null to allow it.
export function evaluate(event, { policy, acliSite, createdKeys }) {
  if (!policy) return null;
  const decisions = classify(event.tool_name, event.tool_input).map((action) => {
    const site = action.site === "acli" ? acliSite() : action.site;
    return decide(action, siteRule(policy, site), createdKeys());
  });
  return decisions.find((d) => d?.permissionDecision === "deny") ?? decisions.find(Boolean) ?? null;
}

// ---- Remember issues the agent created ----------------------------------

export function createdKey(event) {
  const isCreate = classify(event.tool_name, event.tool_input).some((a) => a.kind === "create");
  if (!isCreate) return null;
  const text = JSON.stringify(event.tool_response ?? "");
  const match = text.match(/\\*"key\\*"\s*:\s*\\*"([A-Z][A-Z0-9_]*-\d+)/) ?? text.match(/\b([A-Z][A-Z0-9_]*-\d+)\b/);
  return match?.[1] ?? null;
}

function createdStore() {
  const dir = process.env.CLAUDE_PLUGIN_DATA ?? path.join(os.homedir(), ".agent-coding-tools");
  return path.join(dir, "jira-created-issues.json");
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function readAcliSite() {
  try {
    const out = execFileSync("acli", ["jira", "auth", "status"], { encoding: "utf8", timeout: 10000 });
    return out.match(/[a-z0-9-]+\.atlassian\.net/i)?.[0];
  } catch {
    return undefined;
  }
}

function main(event) {
  if (event.hook_event_name === "PostToolUse") {
    const key = createdKey(event);
    if (key) {
      const file = createdStore();
      const created = readJson(file) ?? [];
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify([...new Set([...created, key])].slice(-500)));
    }
    return null;
  }

  let policy;
  try {
    policy = readJson(POLICY_FILE);
  } catch {
    policy = { default: "invalid", sites: {} };
  }
  let site;
  return evaluate(event, {
    policy,
    acliSite: () => (site ??= readAcliSite()),
    createdKeys: () => readJson(createdStore()) ?? [],
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    const decision = main(JSON.parse(input));
    if (decision) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }));
    }
  });
}
