---
name: worktree
description: Creates an isolated git worktree and executes a development task inside it. Use this skill whenever the user invokes /worktree followed by a requirement, feature, fix, or any description of work to be done. The skill derives a branch name from the requirement, creates a worktree at .trees/[name], and implements the task in isolation from the main branch. Always use this skill when the user types /worktree.
---

# Worktree Skill

The user wants to work on something in isolation from the main branch. Your job is to:

1. Derive a branch name from the requirement
2. Create the git worktree
3. Fork yourself to implement the task inside the worktree

## Step 1: Derive the branch name

From the user's requirement (the args passed to /worktree), produce a short kebab-case name that captures the intent.

Examples:
- "add a pause screen" → `add-pause-screen`
- "fix scoring bug when clearing multiple lines" → `fix-multi-line-scoring`
- "refactor the drawing functions" → `refactor-drawing`
- "implementar sistema de niveles" → `implementar-niveles`

Keep it under 5 words. Use lowercase, hyphens only, no special characters.

## Step 2: Create the worktree

Run this command from the project root:

```bash
git worktree add .trees/[name] -b [name]
```

If the branch already exists (exit code non-zero with "already exists"), try appending `-2`, `-3`, etc.

Tell the user: "Worktree created at `.trees/[name]` on branch `[name]`."

## Step 3: Fork to implement the task

Spawn a forked agent (subagent_type: "fork") with a prompt like this:

```
You are working inside an isolated git worktree at: C:\Projects\claude-code\03-tetris\.trees\[name]

ALL your file reads and writes must target paths inside that directory. Do NOT touch the parent project directory.

Your task: [the user's original requirement verbatim]

When done, summarize what you changed and which files were modified.
```

The fork inherits your full conversation context (including CLAUDE.md), so it already knows the project architecture.

## Step 4: Report back

Once the fork completes, tell the user:
- Branch: `[name]`
- Worktree path: `.trees/[name]`
- Summary of what was implemented

Remind them they can switch to it with:
```bash
cd .trees/[name]
```
Or merge/PR from that branch when ready.
