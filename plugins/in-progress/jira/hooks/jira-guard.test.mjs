import assert from "node:assert/strict";
import { test } from "node:test";
import { createdKey, evaluate } from "./jira-guard.mjs";

const policy = {
  default: "read-only",
  sites: {
    "home.atlassian.net": { profile: "full" },
    "work.atlassian.net": { profile: "story-content-locked", cloudId: "abc-123", editableFields: ["assignee", "labels"] },
  },
};

function run(tool_name, tool_input, { acliSite = "work.atlassian.net", createdKeys = [], withPolicy = policy } = {}) {
  const decision = evaluate(
    { tool_name, tool_input },
    { policy: withPolicy, acliSite: () => acliSite, createdKeys: () => createdKeys },
  );
  return decision?.permissionDecision ?? "allow";
}

const mcp = (tool) => `mcp__atlassian__${tool}`;
const work = { cloudId: "work.atlassian.net" };

test("no policy file restricts nothing", () => {
  assert.equal(run(mcp("editJiraIssue"), { ...work, fields: { summary: "x" } }, { withPolicy: null }), "allow");
});

test("reads are always allowed", () => {
  assert.equal(run(mcp("getJiraIssue"), { cloudId: "unknown.atlassian.net", issueIdOrKey: "W-1" }), "allow");
  assert.equal(run("Bash", { command: "acli jira workitem view W-1 --json" }), "allow");
  assert.equal(run("Bash", { command: "git status" }), "allow");
});

test("full site allows everything", () => {
  const home = { cloudId: "home.atlassian.net" };
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

test("locked site: content edits ask unless the agent created the issue", () => {
  const edit = { ...work, issueIdOrKey: "W-7", fields: { description: "new" } };
  assert.equal(run(mcp("editJiraIssue"), edit), "ask");
  assert.equal(run(mcp("editJiraIssue"), edit, { createdKeys: ["W-7"] }), "allow");
  assert.equal(run("Bash", { command: 'acli jira workitem edit --key W-7 --summary "x" --yes' }), "ask");
  assert.equal(run("Bash", { command: 'acli jira workitem edit --key W-7 --labels "a" --yes' }), "allow");
});

test("locked site: bulk content edits and deletes are denied", () => {
  assert.equal(run("Bash", { command: 'acli jira workitem edit --jql "project = W" --summary x --yes' }), "deny");
  assert.equal(run("Bash", { command: "acli jira workitem delete --key W-1 --yes" }), "deny");
});

test("locked site: REST writes are denied, REST reads allowed", () => {
  const url = "https://api.atlassian.com/ex/jira/abc-123/rest/api/3/issue/W-1";
  assert.equal(run("Bash", { command: `curl -X PUT ${url} -H "Authorization: Bearer $JIRA_ACCESS_TOKEN" --data @f.json` }), "deny");
  assert.equal(run("Bash", { command: `curl ${url} -H "Authorization: Bearer $JIRA_ACCESS_TOKEN"` }), "allow");
  assert.equal(run("PowerShell", { command: `Invoke-RestMethod -Method Put -Uri https://work.atlassian.net/rest/api/3/issue/W-1` }), "deny");
});

test("acli uses its signed-in site", () => {
  const cmd = 'acli jira workitem edit --key H-1 --summary "x" --yes';
  assert.equal(run("Bash", { command: cmd }, { acliSite: "home.atlassian.net" }), "allow");
  assert.equal(run("Bash", { command: cmd }, { acliSite: null }), "deny");
});

test("compound commands take the strictest decision", () => {
  const cmd = "acli jira workitem view W-1 && acli jira workitem delete --key W-1 --yes";
  assert.equal(run("Bash", { command: cmd }), "deny");
});

test("Copilot MCP tool names are recognised", () => {
  assert.equal(run("atlassian-createJiraIssue", { ...work, issueTypeName: "Story" }), "deny");
});

test("an unknown profile denies writes", () => {
  const broken = { sites: { "work.atlassian.net": { profile: "typo" } } };
  assert.equal(run(mcp("addCommentToJiraIssue"), work, { withPolicy: broken }), "deny");
});

test("records keys of created issues", () => {
  const mcpEvent = {
    tool_name: mcp("createJiraIssue"),
    tool_input: { ...work, issueTypeName: "Task" },
    tool_response: [{ type: "text", text: '{"id":"1","key":"W-42","self":"..."}' }],
  };
  assert.equal(createdKey(mcpEvent), "W-42");
  const acliEvent = {
    tool_name: "Bash",
    tool_input: { command: "acli jira workitem create --project W --type Task --summary x --json" },
    tool_response: { stdout: '{"key": "W-43"}' },
  };
  assert.equal(createdKey(acliEvent), "W-43");
  assert.equal(createdKey({ tool_name: "Bash", tool_input: { command: "echo W-1" }, tool_response: "W-1" }), null);
});
