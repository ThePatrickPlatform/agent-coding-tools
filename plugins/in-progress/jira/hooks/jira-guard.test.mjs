import assert from "node:assert/strict";
import { test } from "node:test";
import { createdKey, evaluate, handle } from "./jira-guard.mjs";

const HOME = "example-home.atlassian.net";
const WORK = "example-work.atlassian.net";

const policy = {
  default: "read-only",
  sites: {
    [HOME]: { profile: "full" },
    [WORK]: { profile: "story-content-locked", cloudId: "abc-123", editableFields: ["assignee", "labels"] },
  },
};

function run(tool_name, tool_input, { acliSite = WORK, created = {}, withPolicy = policy } = {}) {
  const decision = evaluate(
    { tool_name, tool_input },
    { policy: withPolicy, acliSite: () => acliSite, createdKeys: (site) => created[site] ?? [] },
  );
  return decision?.permissionDecision ?? "allow";
}

const mcp = (tool) => `mcp__atlassian__${tool}`;
const work = { cloudId: WORK };

test("no policy file restricts nothing", () => {
  assert.equal(run(mcp("editJiraIssue"), { ...work, fields: { summary: "x" } }, { withPolicy: null }), "allow");
});

test("reads are always allowed", () => {
  assert.equal(run(mcp("getJiraIssue"), { cloudId: "unknown.atlassian.net", issueIdOrKey: "W-1" }), "allow");
  assert.equal(run(mcp("searchJiraIssuesUsingJql"), work), "allow");
  assert.equal(run("Bash", { command: "acli jira workitem view W-1 --json" }), "allow");
  assert.equal(run("Bash", { command: "git status" }), "allow");
});

test("full site allows everything", () => {
  const home = { cloudId: HOME };
  assert.equal(run(mcp("editJiraIssue"), { ...home, issueIdOrKey: "H-1", fields: { summary: "x" } }), "allow");
  assert.equal(run(mcp("createJiraIssue"), { ...home, issueTypeName: "Story" }), "allow");
});

test("unlisted site falls back to the default profile", () => {
  assert.equal(run(mcp("addCommentToJiraIssue"), { cloudId: "other.atlassian.net" }), "deny");
});

test("locked site: comment, link, assign, transition, worklog are allowed", () => {
  for (const tool of ["addCommentToJiraIssue", "createIssueLink", "transitionJiraIssue", "addWorklogToJiraIssue"]) {
    assert.equal(run(mcp(tool), work), "allow", tool);
  }
  assert.equal(run(mcp("editJiraIssue"), { ...work, issueIdOrKey: "W-1", fields: { assignee: { accountId: "a" } } }), "allow");
  assert.equal(run("Bash", { command: 'acli jira workitem assign --key W-1 --assignee "@me" --yes' }), "allow");
  assert.equal(run("Bash", { command: 'acli jira workitem transition --key W-1 --status "In Progress" --yes' }), "allow");
  assert.equal(run("Bash", { command: "acli jira workitem comment create --key W-1 --body-file c.md" }), "allow");
});

test("locked site matches by cloudId too", () => {
  assert.equal(run(mcp("createJiraIssue"), { cloudId: "abc-123", issueTypeName: "Epic" }), "deny");
});

test("locked site: creating stories and epics is denied, tasks are allowed", () => {
  assert.equal(run(mcp("createJiraIssue"), { ...work, issueTypeName: "Story" }), "deny");
  assert.equal(run(mcp("createJiraIssue"), { ...work, issueTypeName: "epic" }), "deny");
  assert.equal(run(mcp("createJiraIssue"), { ...work, issueTypeName: "Task" }), "allow");
  assert.equal(run("Bash", { command: 'acli jira workitem create --project W --type Story --summary "x"' }), "deny");
  assert.equal(run("Bash", { command: 'acli jira workitem create --project W --type Task --summary "x"' }), "allow");
  assert.equal(run("Bash", { command: "acli jira workitem create --from-json t.json" }), "ask");
});

test("locked site: content edits ask unless the agent created the issue on that site", () => {
  const edit = { ...work, issueIdOrKey: "W-7", fields: { description: "new" } };
  assert.equal(run(mcp("editJiraIssue"), edit), "ask");
  assert.equal(run(mcp("editJiraIssue"), edit, { created: { [WORK]: ["W-7"] } }), "allow");
  assert.equal(run(mcp("editJiraIssue"), edit, { created: { [HOME]: ["W-7"] } }), "ask");
  assert.equal(run("Bash", { command: 'acli jira workitem edit --key W-7 --summary "x" --yes' }), "ask");
  assert.equal(run("Bash", { command: 'acli jira workitem edit --key W-7 --labels "a" --yes' }), "allow");
});

test("locked site: bulk content edits and deletes are denied", () => {
  assert.equal(run("Bash", { command: 'acli jira workitem edit --jql "project = W" --summary x --yes' }), "deny");
  assert.equal(run("Bash", { command: "acli jira workitem delete --key W-1 --yes" }), "deny");
});

test("locked site: REST writes are denied, other REST calls ask", () => {
  const url = "https://api.atlassian.com/ex/jira/abc-123/rest/api/3/issue/W-1";
  const auth = '-H "Authorization: Bearer $JIRA_ACCESS_TOKEN"';
  assert.equal(run("Bash", { command: `curl -X PUT ${url} ${auth} --data @f.json` }), "deny");
  assert.equal(run("Bash", { command: `curl ${url} ${auth}` }), "ask");
  const fullWork = { sites: { [WORK]: { profile: "full" } } };
  assert.equal(run("Bash", { command: `curl https://${WORK}/rest/api/3/issue/W-1` }, { withPolicy: fullWork }), "allow");
  assert.equal(run("PowerShell", { command: `Invoke-RestMethod -Method Put -Uri https://${WORK}/rest/api/3/issue/W-1` }), "deny");
});

test("locked site: REST writes cannot slip past the shell checks", () => {
  const url = `https://${WORK}/rest/api/3/issue/W-1`;
  for (const command of [
    `U=${url}\ncurl -X PUT $U --data @f.json`,
    `curl ${url}/comment -d@f.json`,
    `curl ${url} --data=@f.json`,
    `curl ${url} -T f.json`,
    `wget --method=PUT ${url}`,
  ]) {
    assert.equal(run("Bash", { command }), "deny", command);
  }
  assert.equal(run("Bash", { command: `python -c "import requests; requests.put('${url}')"` }), "ask");
  assert.equal(run("Bash", { command: `node put.js ${url}` }), "ask");
});

test("unknown Jira MCP tools ask instead of passing as reads", () => {
  for (const tool of ["bulkEditJiraIssues", "setJiraIssueField", "upsertJiraIssue"]) {
    assert.equal(run(mcp(tool), work), "ask", tool);
  }
});

test("the guard's own files need approval to change", () => {
  const policyPath = "/home/me/.agent-coding-tools/jira-policy.json";
  assert.equal(run("Write", { file_path: policyPath, content: "{}" }), "ask");
  assert.equal(run("Edit", { file_path: policyPath }, { withPolicy: null }), "ask");
  assert.equal(run("Bash", { command: `echo '{}' > ${policyPath}` }), "ask");
  assert.equal(run("Bash", { command: "echo W-9 >> ~/.agent-coding-tools/jira-created-issues.json" }), "ask");
  assert.equal(run("Write", { file_path: "setup/jira-policy.example.json" }), "allow");
});

test("acli uses its signed-in site", () => {
  const cmd = 'acli jira workitem edit --key H-1 --summary "x" --yes';
  assert.equal(run("Bash", { command: cmd }, { acliSite: HOME }), "allow");
  assert.equal(run("Bash", { command: cmd }, { acliSite: null }), "deny");
});

test("compound commands take the strictest decision", () => {
  const cmd = "acli jira workitem view W-1 && acli jira workitem delete --key W-1 --yes";
  assert.equal(run("Bash", { command: cmd }), "deny");
});

test("Copilot MCP tool names are recognised", () => {
  assert.equal(run("atlassian-createJiraIssue", { ...work, issueTypeName: "Story" }), "deny");
});

test("an invalid policy denies writes", () => {
  const comment = [mcp("addCommentToJiraIssue"), work];
  assert.equal(run(...comment, { withPolicy: { sites: { [WORK]: { profile: "typo" } } } }), "deny");
  assert.equal(run(...comment, { withPolicy: { sites: { [WORK]: null } } }), "deny");
  assert.equal(run(...comment, { withPolicy: { sites: { [WORK]: { profile: "full", lockedTypes: "Story" } } } }), "deny");
  assert.equal(run(...comment, { withPolicy: ["not", "an", "object"] }), "deny");
});

test("errors deny instead of letting the call through", () => {
  const decision = handle("not json");
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /guard failed/);
});

test("records keys only from a standalone, successful create", () => {
  const mcpCreate = { tool_name: mcp("createJiraIssue"), tool_input: { ...work, issueTypeName: "Task" } };
  assert.equal(createdKey({ ...mcpCreate, tool_response: [{ type: "text", text: '{"id":"1","key":"W-42"}' }] }), "W-42");
  assert.equal(createdKey({ ...mcpCreate, tool_response: { isError: true, content: '{"key":"W-42"}' } }), null);

  const acliCreate = "acli jira workitem create --project W --type Task --summary x --json";
  assert.equal(createdKey({ tool_name: "Bash", tool_input: { command: acliCreate }, tool_response: { stdout: '{"key": "W-43"}' } }), "W-43");
  assert.equal(
    createdKey({
      tool_name: "Bash",
      tool_input: { command: `acli jira workitem view W-7 --json; ${acliCreate}` },
      tool_response: { stdout: '{"key": "W-7"}\n{"key": "W-44"}' },
    }),
    null,
  );
  assert.equal(createdKey({ tool_name: "Bash", tool_input: { command: acliCreate }, tool_response: { stdout: "created W-45" } }), null);
  assert.equal(createdKey({ tool_name: "Bash", tool_input: { command: "echo W-1" }, tool_response: "W-1" }), null);
});

test("created keys come only from the create's own JSON", () => {
  const create = "acli jira workitem create --project W --type Task --summary t --json";
  const withSubstitution = "acli jira workitem create --project W --type Task --summary $(printf x) --json";
  assert.equal(createdKey({ tool_name: "Bash", tool_input: { command: withSubstitution }, tool_response: { stdout: '{"key":"W-1"}' } }), null);
  assert.equal(createdKey({ tool_name: "Bash", tool_input: { command: create }, tool_response: { stdout: "ok", stderr: '{"key":"W-1"}' } }), null);
  const mcpCreate = { tool_name: mcp("createJiraIssue"), tool_input: { ...work, issueTypeName: "Task" } };
  const nested = [{ type: "text", text: JSON.stringify({ fields: { summary: '"key":"W-1"' }, key: "W-50" }) }];
  assert.equal(createdKey({ ...mcpCreate, tool_response: nested }), "W-50");
});

test("REST calls cannot hide behind an acli command or substitution", () => {
  const url = `https://${WORK}/rest/api/3/issue/W-1`;
  assert.equal(run("Bash", { command: `curl -X DELETE ${url} # acli jira workitem view W-1` }), "deny");
  assert.equal(run("Bash", { command: `acli jira workitem view W-1 $(curl -X PUT ${url} -d @f)` }), "deny");
  assert.equal(run("Bash", { command: `acli jira workitem view W-1 $(curl ${url})` }), "ask");
});

test("switching the acli site asks first", () => {
  assert.equal(run("Bash", { command: `acli jira auth switch --site ${WORK}` }, { acliSite: HOME }), "ask");
  const cmd = `acli jira auth switch --site ${WORK} && acli jira workitem edit --key W-1 --summary x --yes`;
  assert.equal(run("Bash", { command: cmd }, { acliSite: HOME }), "ask");
  assert.equal(run("Bash", { command: "acli jira auth status" }), "allow");
});

test("a created Task cannot be turned into a Story without asking", () => {
  const created = { [WORK]: ["W-7"] };
  const edit = { ...work, issueIdOrKey: "W-7", fields: { issuetype: { name: "Story" }, summary: "x" } };
  assert.equal(run(mcp("editJiraIssue"), edit, { created }), "ask");
  assert.equal(run("Bash", { command: "acli jira workitem edit --key W-7 --type Story --yes" }, { created }), "ask");
  assert.equal(run("Bash", { command: "acli jira workitem edit --key W-7 --summary x --yes" }, { created }), "allow");
});

test("guard files are caught when globbed, quoted, or at a custom path", () => {
  assert.equal(run("Bash", { command: "rm ~/.agent-coding-*/jira-*.json" }), "ask");
  assert.equal(run("Bash", { command: 'cp x ~/.agent-coding-too""ls/p.json' }), "ask");
  assert.equal(run("Bash", { command: "cd /c/Code/agent-coding-tools && git status" }), "allow");
});

test("lower-case shell tool names are still checked", () => {
  assert.equal(run("bash", { command: "acli jira workitem delete --key W-1 --yes" }), "deny");
  assert.equal(run("powershell", { command: "acli jira workitem delete --key W-1 --yes" }), "deny");
});

test("acli only counts as the command itself", () => {
  const url = `https://${WORK}/rest/api/3/issue/W-1`;
  const disguised = `curl -X PUT ${url} --data @b.json acli jira workitem comment --key W-1`;
  assert.equal(run("Bash", { command: disguised }), "deny");
  const fakeCreate = `printf '{"key":"W-9"}' acli jira workitem create --type Task`;
  assert.equal(createdKey({ tool_name: "Bash", tool_input: { command: fakeCreate }, tool_response: { stdout: '{"key":"W-9"}' } }), null);
  assert.equal(run("Bash", { command: "/usr/local/bin/acli jira workitem delete --key W-1 --yes" }), "deny");
});

test("combined or shortened HTTP flags still need approval", () => {
  const url = `https://${WORK}/rest/api/3/issue/W-1`;
  for (const command of [`curl -sX PUT ${url}`, `curl -sSd @body.json ${url}`, `curl -sT f.json ${url}`, `irm ${url} -Meth Put -InF b.json`]) {
    assert.notEqual(run("Bash", { command }), "allow", command);
  }
});
