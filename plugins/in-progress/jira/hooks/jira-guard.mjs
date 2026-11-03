// Enforces the Jira site policy for Claude Code and GitHub Copilot CLI.
//
// Runs as a PreToolUse hook on Jira MCP tools, shell commands, and file
// edits, and as a PostToolUse hook to remember issues the agent created. Both
// tools send the same payload and accept the same decision output for plugin
// hooks. Any error denies the call rather than letting it through.
//
// The policy file maps each Jira site to a profile. Without a policy file,
// Jira calls are not restricted. See skills/jira/references/site-policy.md.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const POLICY_FILE =
  process.env.JIRA_POLICY_FILE ?? path.join(os.homedir(), ".agent-coding-tools", "jira-policy.json");
const CREATED_FILE = path.join(
  process.env.CLAUDE_PLUGIN_DATA ?? path.join(os.homedir(), ".agent-coding-tools"),
  "jira-created-issues.json",
);

const DEFAULT_LOCKED_TYPES = ["Story", "Epic"];
const DEFAULT_EDITABLE_FIELDS = ["assignee"];
const PROFILES = ["full", "read-only", "story-content-locked"];

const MCP_WRITES = {
  createJiraIssue: (input) => ({ kind: "create", issueType: issueType([input.issueTypeName]) }),
  editJiraIssue: (input) => ({
    kind: "edit",
    keys: input.issueIdOrKey ? [String(input.issueIdOrKey)] : [],
    fields: Object.keys(input.fields ?? {}),
  }),
  transitionJiraIssue: () => ({ kind: "transition" }),
  addCommentToJiraIssue: () => ({ kind: "comment" }),
  createIssueLink: () => ({ kind: "link" }),
  addWorklogToJiraIssue: () => ({ kind: "worklog" }),
};
const JIRA_TOOL = /Jira|IssueLink|Worklog/;
const READ_TOOL = /^(get|search|lookup|list|fetch)/i;
const WRITE_VERB = /^(create|edit|update|delete|remove|add|transition|assign|move|archive)/i;
const SHELL_TOOLS = new Set(["bash", "powershell"]);
const FILE_TOOLS = new Set(["edit", "write", "multiedit", "notebookedit", "create"]);

const ACLI_READ_VERBS = new Set(["view", "search", "list", "type", "status", "get", "count", "help"]);
const ACLI_EDIT_FLAGS = {
  "--summary": "summary", "-s": "summary",
  "--description": "description", "--description-file": "description", "-d": "description",
  "--labels": "labels", "-l": "labels", "--remove-labels": "labels",
  "--type": "issuetype", "-t": "issuetype",
  "--assignee": "assignee", "-a": "assignee", "--remove-assignee": "assignee",
};
const ACLI_NEUTRAL_FLAGS = new Set(["--yes", "-y", "--json", "--key", "-k", "--jql", "--filter", "--help", "-h"]);

// Shell checks are best-effort. On a site that is not "full", any command
// that reaches Atlassian outside acli is denied when it visibly writes and
// asks otherwise; the guard does not try to prove a REST call only reads.
const REST_HOSTS = /([a-z0-9-]+\.atlassian\.net)|api\.atlassian\.com\/ex\/jira\/([\w-]+)/gi;
const REST_WRITE =
  /(-X|--request|-Method|--method)[\s=]*['"]?(POST|PUT|PATCH|DELETE)\b|(^|\s)(-d|--data[\w-]*|--json|-F|--form|-T|--upload-file|-Body|-InFile|--post-data|--post-file|--body-data|--body-file)(?=[\s=@'"]|$)/im;
const GUARD_FILES = /jira-policy\.json|jira-created-issues|\.agent-coding-tools/i;
// In shell commands, also catch globbed or quoted forms such as ~/.agent-coding-*.
const GUARD_SHELL = /\.agent-coding|jira-policy|jira-created/i;
// Command substitution and comments can hide what a command really does.
const OPAQUE = /`|\$\(|<\(|(^|\s)#/;

// ---- Classify a tool call into Jira write actions -----------------------

export function classify(toolName, toolInput) {
  const input = toolInput ?? {};
  const name = String(toolName ?? "").toLowerCase();
  if (SHELL_TOOLS.has(name)) return classifyShell(String(input.command ?? ""));
  if (FILE_TOOLS.has(name)) {
    const file = String(input.file_path ?? input.path ?? input.notebook_path ?? "");
    const resolved = file && path.resolve(file);
    const guarded = GUARD_FILES.test(file) || resolved === path.resolve(POLICY_FILE) || resolved === CREATED_FILE;
    return guarded ? [{ kind: "guard-file" }] : [];
  }
  const tool = toolName.split(/__|-/).pop();
  const site = input.cloudId;
  if (MCP_WRITES[tool]) return [{ ...MCP_WRITES[tool](input), site }];
  if (JIRA_TOOL.test(tool) && !READ_TOOL.test(tool)) return [{ kind: "unknown-write", site }];
  return [];
}

function classifyShell(command) {
  const actions = [];
  const other = [];
  let acliSegments = 0;
  for (const segment of command.split(/[;&|\n]+/)) {
    // acli counts only as the command itself, not as words inside another one.
    const acli = segment.match(/^\s*(?:\S*[\\/])?acli(?:\.exe)?\s+jira\s+(.*)/i);
    if (acli) {
      const action = classifyAcli(tokenize(acli[1]));
      if (action) actions.push({ ...action, site: "acli" });
      acliSegments++;
    } else if (/\bacli\b/i.test(segment) && /\bjira\b/i.test(segment)) {
      // acli run indirectly, such as through env, xargs, or quotes.
      actions.push({ kind: "unknown-write", site: "acli" });
    } else if (segment.trim()) {
      other.push(segment);
    }
  }
  const opaque = OPAQUE.test(command);
  if (opaque && acliSegments > 0) actions.push({ kind: "unknown-write", site: "acli" });
  // Judge the whole command, so a URL in one line and a write in the next,
  // or a REST call beside an acli command, are still seen together.
  const onlyAcli = other.length === 0 && acliSegments > 0 && !opaque;
  if (!onlyAcli) {
    const kind = REST_WRITE.test(command) ? "rest-write" : "rest-unknown";
    for (const host of command.matchAll(REST_HOSTS)) actions.push({ kind, site: host[1] ?? host[2] });
  }
  if (GUARD_SHELL.test(command)) actions.push({ kind: "guard-file" });
  return actions;
}

function classifyAcli(tokens) {
  const [group, verb, sub] = tokens;
  const flags = tokens.filter((t) => t.startsWith("-"));
  const flagValues = (...names) =>
    tokens.flatMap((t, i) => (names.includes(t) && tokens[i + 1] ? tokens[i + 1].split(",") : []));
  const flagValue = (...names) => flagValues(...names)[0];
  if (group === "auth") return verb === "status" ? null : { kind: "acli-auth" };
  if (group !== "workitem") {
    return !verb || ACLI_READ_VERBS.has(verb) || ACLI_READ_VERBS.has(sub) ? null : { kind: "unknown-write" };
  }
  switch (verb) {
    case "create":
      return { kind: "create", issueType: flags.includes("--from-json") ? undefined : issueType(flagValues("--type", "-t")) };
    case "create-bulk":
    case "clone":
      return { kind: "create", issueType: undefined };
    case "edit": {
      const fields = flags.filter((f) => !ACLI_NEUTRAL_FLAGS.has(f)).map((f) => ACLI_EDIT_FLAGS[f] ?? "other fields");
      const bulk = flags.includes("--jql") || flags.includes("--filter");
      return { kind: "edit", keys: flagValues("--key", "-k"), fields, bulk };
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

// The one issue type named, or undefined when it is missing, repeated, or
// not a plain name (such as a numeric type ID).
function issueType(values) {
  const names = values.filter((v) => v !== undefined).map((v) => String(v).trim());
  return names.length === 1 && /[a-z]/i.test(names[0]) ? names[0] : undefined;
}

function tokenize(text) {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .flatMap((t) => t.match(/^(--?[\w-]+)=(.*)$/s)?.slice(1) ?? [t]);
}

export function siteId(site) {
  return String(site ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.+$/, "");
}

// ---- Decide -------------------------------------------------------------

const INVALID = { profile: "invalid" };

function stringList(value, fallback) {
  if (value === undefined) return fallback;
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
}

export function siteRule(policy, site) {
  const id = siteId(site);
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return { ...INVALID, host: id };
  const sites = Object.entries(policy.sites ?? {});
  const [host, rule] =
    (id &&
      sites.find(
        ([host, rule]) => host.toLowerCase() === id || String(rule?.cloudId ?? "").toLowerCase() === id,
      )) ||
    [];
  const resolved = rule === undefined ? { profile: policy.default ?? "read-only" } : rule;
  const lockedTypes = stringList(resolved?.lockedTypes, DEFAULT_LOCKED_TYPES);
  const editableFields = stringList(resolved?.editableFields, DEFAULT_EDITABLE_FIELDS);
  const valid = resolved && typeof resolved === "object" && lockedTypes && editableFields;
  return {
    host: host ?? (id || "an unidentified site"),
    unlisted: rule === undefined,
    profile: valid ? resolved.profile : "invalid",
    lockedTypes: (lockedTypes ?? []).map((t) => t.toLowerCase()),
    editableFields: editableFields ?? [],
  };
}

export function decide(action, rule, createdKeys) {
  const where = `${rule.host} (${rule.profile} in ${POLICY_FILE})`;
  if (!PROFILES.includes(rule.profile)) {
    return deny(`The Jira policy for ${rule.host} is invalid ("${rule.profile}"). Fix ${POLICY_FILE}.`);
  }
  if (rule.profile === "full") {
    // A site may be named by its cloud ID, which a policy listing only its
    // hostname cannot match. Do not let a permissive default cover it.
    return rule.unlisted
      ? ask(`${rule.host} is not listed in ${POLICY_FILE}, so its rules are unknown. Approve only if this is a site you may change freely, and add it to the policy (with its cloudId).`)
      : null;
  }
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
      // The created-issue exemption never covers changing the type, which
      // could turn a Task into a locked Story.
      const allCreated = action.keys.length > 0 && action.keys.every((k) => createdKeys.includes(k));
      if (allCreated && !content.includes("issuetype")) return null;
      return ask(
        `${action.keys.join(", ") || "This issue"} may be a ${locked}; their content (${content.join(", ")}) is locked on ${where}. ` +
          `Only approve if it is not a ${locked}. Otherwise add a comment proposing the change for the product owner.`,
      );
    }
    case "delete":
      return deny(`Deleting or archiving issues is not allowed on ${where}.`);
    case "rest-write":
      return deny(`Writes through the REST API are not allowed on ${where}. Use the Atlassian MCP server or acli.`);
    case "rest-unknown":
      return ask(`This command reaches ${where} outside acli and may change it. Approve only if it only reads.`);
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
  const decisions = classify(event.tool_name, event.tool_input).map((action) => {
    if (action.kind === "guard-file") {
      return ask(`This changes or reads the Jira policy guard's files. Only the user should change the Jira policy; approve only if you asked for this.`);
    }
    if (policy === null) return null;
    if (action.kind === "acli-auth") {
      return ask(`This changes which Jira site acli is signed in to, which changes the policy that applies. Approve only if you asked for this.`);
    }
    const site = action.site === "acli" ? acliSite() : action.site;
    return decide(action, siteRule(policy, site), createdKeys(site));
  });
  return decisions.find((d) => d?.permissionDecision === "deny") ?? decisions.find(Boolean) ?? null;
}

// ---- Remember issues the agent created ----------------------------------

// Returns the key from a successful, standalone create, or null. The key
// must be the top-level "key" of the JSON the create returned, so text inside
// a summary or on stderr cannot add one.
export function createdKey(event) {
  const command = String(event.tool_input?.command ?? "");
  if (/[;&|\n]/.test(command) || OPAQUE.test(command)) return null;
  if (command && !/^\s*acli(?:\.exe)?\s/i.test(command)) return null;
  const actions = classify(event.tool_name, event.tool_input);
  if (actions.length !== 1 || actions[0].kind !== "create" || !actions[0].issueType) return null;
  const response = event.tool_response;
  if (!response || response.isError) return null;
  const candidates = command
    ? [response.stdout]
    : [response, ...[response.content ?? response].flat().map((block) => block?.text)];
  for (const candidate of candidates) {
    const key = topLevelKey(candidate);
    if (key) return key;
  }
  return null;
}

function topLevelKey(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const key = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.key : null;
  return typeof key === "string" && /^[A-Z][A-Z0-9_]*-\d+$/.test(key) ? key : null;
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

// A missing or damaged store only means more questions, never fewer.
function readCreated() {
  try {
    const store = readJson(CREATED_FILE);
    return store && typeof store === "object" && !Array.isArray(store) ? store : {};
  } catch {
    return {};
  }
}

function readAcliSite() {
  try {
    const out = execFileSync("acli", ["jira", "auth", "status"], { encoding: "utf8", timeout: 10000 });
    return out.match(/[a-z0-9-]+\.atlassian\.net/i)?.[0];
  } catch {
    return undefined;
  }
}

function readPolicy() {
  if (!fs.existsSync(POLICY_FILE)) return null;
  try {
    const policy = JSON.parse(fs.readFileSync(POLICY_FILE, "utf8"));
    return policy && typeof policy === "object" && !Array.isArray(policy) ? policy : { default: "invalid" };
  } catch {
    return { default: "invalid" };
  }
}

export function handle(inputText) {
  let event;
  try {
    event = JSON.parse(inputText);
    let site;
    const acliSite = () => (site ??= readAcliSite());

    if (event.hook_event_name === "PostToolUse") {
      const key = createdKey(event);
      if (key) {
        const id = siteId(event.tool_input?.command ? acliSite() : event.tool_input?.cloudId);
        const store = readCreated();
        store[id] = [...new Set([...(store[id] ?? []), key])].slice(-500);
        fs.mkdirSync(path.dirname(CREATED_FILE), { recursive: true });
        fs.writeFileSync(CREATED_FILE, JSON.stringify(store));
      }
      return null;
    }

    const created = readCreated();
    return evaluate(event, {
      policy: readPolicy(),
      acliSite,
      createdKeys: (s) => created[siteId(s)] ?? [],
    });
  } catch (err) {
    if (event?.hook_event_name === "PostToolUse") return null;
    return deny(`The Jira policy guard failed (${err.message}), so this call was blocked. Fix the problem or tell the user.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    const decision = handle(input);
    if (decision) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }));
    }
  });
}
