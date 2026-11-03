// Installs and checks this marketplace's plugins the same way on every
// machine, for Claude Code and GitHub Copilot CLI. See SETUP.md.
//
//   node setup/setup.mjs --profile engineer           install or update
//   node setup/setup.mjs --profile engineer --check   report only, change nothing
//
// Options:
//   --profile <name[,name]>   profiles from setup/profiles.json (required)
//   --tool claude|copilot     only set up one tool (default: every one installed)
//   --check                   change nothing; exit 1 if anything is missing

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = readJson(path.join(ROOT, "setup", "profiles.json"));
const MARKETPLACE = readJson(path.join(ROOT, ".claude-plugin", "marketplace.json"));
const MKT = CONFIG.marketplace.name;
const POLICY_FILE =
  process.env.JIRA_POLICY_FILE ?? path.join(os.homedir(), ".agent-coding-tools", "jira-policy.json");
const POLICY_PROFILES = ["full", "read-only", "story-content-locked"];

const args = parseArgs(process.argv.slice(2));
const CHECK = args.check;
let problems = 0;

const ok = (msg) => console.log(`  ✔ ${msg}`);
const warn = (msg) => console.log(`  ! ${msg}`);
const fail = (msg) => {
  problems++;
  console.log(`  ✖ ${msg}`);
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const profiles = value("--profile")?.split(",").filter(Boolean) ?? [];
  const unknown = profiles.filter((p) => !CONFIG.profiles[p]);
  if (profiles.length === 0 || unknown.length > 0) {
    console.error(`Usage: node setup/setup.mjs --profile <${Object.keys(CONFIG.profiles).join("|")}> [--tool claude|copilot] [--check]`);
    if (unknown.length > 0) console.error(`Unknown profile: ${unknown.join(", ")}`);
    process.exit(2);
  }
  return { profiles, tool: value("--tool"), check: argv.includes("--check") };
}

// On Windows, claude and copilot are often .cmd shims, which need a shell.
function run(cmd, cmdArgs, { quiet = false, shell = process.platform === "win32" } = {}) {
  const result = spawnSync(cmd, cmdArgs, { encoding: "utf8", shell, timeout: 180000 });
  if (!quiet && result.status !== 0) {
    console.log(`    ${(result.stderr || result.stdout || "").trim().split("\n").join("\n    ")}`);
  }
  return { ok: result.status === 0, out: result.stdout ?? "" };
}

function runJson(cmd, cmdArgs) {
  const { ok, out } = run(cmd, cmdArgs, { quiet: true });
  try {
    return ok ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}

// Makes a change, or in --check mode reports it as missing.
function change(description, cmd, cmdArgs) {
  if (CHECK) return fail(`${description} (run setup without --check)`);
  console.log(`  → ${description}: ${cmd} ${cmdArgs.join(" ")}`);
  if (!run(cmd, cmdArgs).ok) fail(`${description} failed`);
}

// ---- What this profile needs --------------------------------------------

function pluginManifest(name) {
  const entry = MARKETPLACE.plugins.find((p) => p.name === name);
  if (!entry) throw new Error(`setup/profiles.json names ${name}, which is not in the marketplace`);
  return readJson(path.join(ROOT, entry.source, ".claude-plugin", "plugin.json"));
}

function wantedPlugins() {
  const wanted = new Map();
  const add = (name) => {
    if (wanted.has(name)) return;
    const manifest = pluginManifest(name);
    wanted.set(name, manifest.version);
    for (const dep of manifest.dependencies ?? []) add(dep);
  };
  for (const profile of args.profiles) CONFIG.profiles[profile].forEach(add);
  return wanted;
}

// ---- Claude Code ----------------------------------------------------------

function setupClaude(wanted) {
  const marketplaces = runJson("claude", ["plugin", "marketplace", "list", "--json"]) ?? [];
  if (marketplaces.some((m) => m.name === MKT)) ok(`marketplace ${MKT}`);
  else change(`add marketplace ${MKT}`, "claude", ["plugin", "marketplace", "add", CONFIG.marketplace.repo]);
  if (!CHECK) run("claude", ["plugin", "marketplace", "update", MKT], { quiet: true });

  const installed = new Map((runJson("claude", ["plugin", "list", "--json"]) ?? []).map((p) => [p.id, p]));
  for (const name of CONFIG.retired) {
    if (installed.has(`${name}@${MKT}`)) change(`remove retired plugin ${name}`, "claude", ["plugin", "uninstall", `${name}@${MKT}`]);
  }
  for (const [name, version] of wanted) {
    const id = `${name}@${MKT}`;
    const plugin = installed.get(id);
    if (!plugin) change(`install ${name}`, "claude", ["plugin", "install", id, "--scope", "user"]);
    else if (plugin.version !== version) change(`update ${name} ${plugin.version} → ${version}`, "claude", ["plugin", "update", id]);
    else if (!plugin.enabled) change(`enable ${name}`, "claude", ["plugin", "enable", id]);
    else ok(`${name} ${version}`);
  }

  const servers = run("claude", ["mcp", "list"], { quiet: true }).out.toLowerCase();
  for (const server of neededServers(wanted)) {
    if (servers.includes(server.match)) ok(`MCP server for ${server.match}`);
    else change(`add MCP server ${server.name}`, "claude", ["mcp", "add", "--transport", "http", "--scope", "user", server.name, server.url]);
  }
}

// ---- GitHub Copilot CLI ---------------------------------------------------

function setupCopilot(wanted) {
  const marketplaces = runJson("copilot", ["plugin", "marketplace", "list", "--json"]) ?? [];
  if (marketplaces.some((m) => m.name === MKT)) ok(`marketplace ${MKT}`);
  else change(`add marketplace ${MKT}`, "copilot", ["plugin", "marketplace", "add", CONFIG.marketplace.repo]);
  if (!CHECK) run("copilot", ["plugin", "marketplace", "update"], { quiet: true });

  const installed = new Map(
    (runJson("copilot", ["plugin", "list", "--json"]) ?? []).filter((p) => p.marketplace === MKT).map((p) => [p.name, p]),
  );
  for (const name of CONFIG.retired) {
    if (installed.has(name)) change(`remove retired plugin ${name}`, "copilot", ["plugin", "uninstall", name]);
  }
  for (const [name, version] of wanted) {
    const plugin = installed.get(name);
    if (!plugin) change(`install ${name}`, "copilot", ["plugin", "install", `${name}@${MKT}`]);
    else if (plugin.version !== version) change(`update ${name} ${plugin.version} → ${version}`, "copilot", ["plugin", "update", name]);
    else if (plugin.enabled === false) fail(`${name} is disabled; enable it in Copilot CLI`);
    else ok(`${name} ${version}`);
  }

  const servers = runJson("copilot", ["mcp", "list", "--json"])?.mcpServers ?? {};
  for (const server of neededServers(wanted)) {
    const found = Object.entries(servers).some(([name, s]) => `${name} ${s.url ?? ""}`.toLowerCase().includes(server.match));
    if (found) ok(`MCP server for ${server.match}`);
    else change(`add MCP server ${server.name}`, "copilot", ["mcp", "add", "--transport", "http", server.name, server.url]);
  }
}

function neededServers(wanted) {
  return Object.entries(CONFIG.mcpServers)
    .filter(([plugin]) => wanted.has(plugin))
    .map(([, server]) => server);
}

// ---- Shared ---------------------------------------------------------------

// Versions are compared with this checkout, so it should match what users install.
function checkClone() {
  const git = (...gitArgs) => run("git", ["-C", ROOT, ...gitArgs], { quiet: true, shell: false });
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").out.trim();
  if (branch !== "main") return warn(`this clone is on ${branch}, not main; expected versions come from ${branch}`);
  git("fetch", "--quiet", "origin", "main");
  const behind = Number(git("rev-list", "--count", "HEAD..origin/main").out.trim() || 0);
  if (behind > 0) warn(`this clone is ${behind} commit(s) behind origin/main; run git pull first`);
  else ok("clone is up to date with main");
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) ok(`Node.js ${process.versions.node}`);
  else fail(`Node.js ${process.versions.node}; plugin hooks need 20 or later`);
}

function checkJiraPolicy() {
  if (!fs.existsSync(POLICY_FILE)) {
    warn(`no Jira site policy at ${POLICY_FILE}; every site has full access`);
    warn(`to limit sites, copy setup/jira-policy.example.json there and edit it`);
    return;
  }
  let policy;
  try {
    policy = readJson(POLICY_FILE);
  } catch (err) {
    return fail(`${POLICY_FILE} is not valid JSON: ${err.message}`);
  }
  const sites = Object.entries(policy.sites ?? {});
  const bad = [
    ...(policy.default && !POLICY_PROFILES.includes(policy.default) ? [`default "${policy.default}"`] : []),
    ...sites.filter(([, rule]) => !POLICY_PROFILES.includes(rule.profile)).map(([host, rule]) => `${host}: "${rule.profile}"`),
  ];
  if (bad.length > 0) fail(`unknown policy profile (${bad.join(", ")}); use ${POLICY_PROFILES.join(", ")}`);
  const noCloudId = sites.filter(([, rule]) => rule?.profile !== "full" && !rule?.cloudId).map(([host]) => host);
  if (noCloudId.length > 0) warn(`add a cloudId for ${noCloudId.join(", ")} so the policy applies when agents use it (see SETUP.md)`);
  const placeholders = sites.filter(([host]) => host.startsWith("your-")).map(([host]) => host);
  if (placeholders.length > 0) fail(`replace the example site names in ${POLICY_FILE}: ${placeholders.join(", ")}`);
  if (bad.length === 0 && placeholders.length === 0) {
    ok(`Jira policy: ${sites.map(([host, rule]) => `${host} ${rule.profile}`).join(", ")}; others ${policy.default ?? "read-only"}`);
  }
}

function checkAcli() {
  if (!run("acli", ["--version"], { quiet: true }).ok) return warn("acli not installed (optional; MCP is enough)");
  const status = run("acli", ["jira", "auth", "status"], { quiet: true });
  if (status.ok) ok(`acli signed in to ${status.out.match(/[a-z0-9-]+\.atlassian\.net/i)?.[0] ?? "Jira"}`);
  else warn("acli is installed but not signed in; run: acli jira auth login (choose the web browser option)");
}

function main() {
  const wanted = wantedPlugins();
  const commit = run("git", ["-C", ROOT, "log", "-1", "--format=%h %cs"], { quiet: true, shell: false }).out.trim();
  console.log(`${CHECK ? "Checking" : "Setting up"} profile ${args.profiles.join(", ")} from ${CONFIG.marketplace.repo} (${commit})`);
  console.log(`Plugins: ${[...wanted.keys()].join(", ")}\n`);

  console.log("Machine");
  checkClone();
  checkNode();
  if (wanted.has("jira")) {
    checkJiraPolicy();
    checkAcli();
  }

  const tools = { claude: setupClaude, copilot: setupCopilot };
  const selected = args.tool ? [args.tool] : Object.keys(tools);
  for (const tool of selected) {
    console.log(`\n${tool === "claude" ? "Claude Code" : "GitHub Copilot CLI"}`);
    if (!tools[tool]) fail(`unknown tool ${tool}`);
    else if (!run(tool, ["--version"], { quiet: true }).ok) (args.tool ? fail : warn)(`${tool} is not installed; skipped`);
    else tools[tool](wanted);
  }

  console.log(problems === 0 ? "\nAll set." : `\n${problems} problem(s) found.`);
  if (!CHECK && neededServers(wanted).length > 0) {
    console.log("Sign in to each MCP server once per tool: run /mcp in Claude Code and in Copilot CLI.");
  }
  process.exit(problems === 0 ? 0 : 1);
}

main();
