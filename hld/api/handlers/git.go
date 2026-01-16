package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/humanlayer/humanlayer/hld/store"
)

// GitHandler handles git operations for sessions
type GitHandler struct {
	store      store.ConversationStore
	httpClient *http.Client
}

// NewGitHandler creates a new git handler
func NewGitHandler(conversationStore store.ConversationStore) *GitHandler {
	return &GitHandler{
		store:      conversationStore,
		httpClient: &http.Client{Timeout: 120 * time.Second},
	}
}

// GitFile represents a file in git status
type GitFile struct {
	Path    string `json:"path"`
	Status  string `json:"status"`
	OldPath string `json:"oldPath,omitempty"`
	Diff    string `json:"diff,omitempty"`
}

// GitStatusResponse represents the response for git status
type GitStatusResponse struct {
	Staged     []GitFile `json:"staged"`
	Unstaged   []GitFile `json:"unstaged"`
	Untracked  []GitFile `json:"untracked"`
	Branch     string    `json:"branch"`
	HasChanges bool      `json:"hasChanges"`
	Ahead      int       `json:"ahead,omitempty"`
	Behind     int       `json:"behind,omitempty"`
}

// FileAction represents a file modification from the conversation
type FileAction struct {
	Path    string `json:"path"`
	Action  string `json:"action"`
	Purpose string `json:"purpose,omitempty"`
}

// ConversationContext represents context extracted from conversation
type ConversationContext struct {
	OriginalQuery   string       `json:"originalQuery"`
	SessionSummary  string       `json:"sessionSummary,omitempty"`
	UserIntents     []string     `json:"userIntents"`
	KeyDecisions    []string     `json:"keyDecisions"`
	FilesModified   []FileAction `json:"filesModified"`
	IssueReferences []string     `json:"issueReferences"`
	ChangeType      string       `json:"changeType"`
	Scope           string       `json:"scope,omitempty"`
}

// GenerateCommitMessageRequest represents the request for generating commit message
type GenerateCommitMessageRequest struct {
	ConversationContext *ConversationContext `json:"conversationContext,omitempty"`
	IncludeUntracked    bool                 `json:"includeUntracked"`
}

// CommitMessage represents a single commit message
type CommitMessage struct {
	Subject string   `json:"subject"`
	Body    string   `json:"body,omitempty"`
	Footer  string   `json:"footer,omitempty"`
	Files   []string `json:"files"`
}

// CommitSuggestion represents the AI-generated commit suggestion
type CommitSuggestion struct {
	Type       string          `json:"type"` // single, multiple, branch
	BranchName string          `json:"branchName,omitempty"`
	Commits    []CommitMessage `json:"commits"`
	Reasoning  string          `json:"reasoning"`
}

// GenerateCommitMessageResponse represents the response for commit message generation
type GenerateCommitMessageResponse struct {
	Suggestion CommitSuggestion `json:"suggestion"`
	GitContext struct {
		RecentCommits    []string `json:"recentCommits"`
		ChangedFileCount int      `json:"changedFileCount"`
		AdditionsCount   int      `json:"additionsCount"`
		DeletionsCount   int      `json:"deletionsCount"`
	} `json:"gitContext"`
}

// CommitRequest represents a request to create commits
type CommitRequest struct {
	Commits        []CommitMessage `json:"commits"`
	CreateBranch   string          `json:"createBranch,omitempty"`
	StageUntracked bool            `json:"stageUntracked"`
	StageFiles     []string        `json:"stageFiles,omitempty"`
}

// CommitResponse represents the response from creating commits
type CommitResponse struct {
	Success       bool     `json:"success"`
	CommitHashes  []string `json:"commitHashes"`
	BranchCreated string   `json:"branchCreated,omitempty"`
	Error         string   `json:"error,omitempty"`
}

// HandleGetGitStatus returns git status for a session's working directory
func (h *GitHandler) HandleGetGitStatus(c *gin.Context) {
	sessionID := c.Param("id")

	// Get session to find working directory
	session, err := h.store.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		slog.Error("session not found for git status", "session_id", sessionID, "error", err)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if session.WorkingDir == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session has no working directory"})
		return
	}

	// Check if it's a git repository
	if !isGitRepo(session.WorkingDir) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Not a git repository"})
		return
	}

	status, err := getGitStatus(session.WorkingDir)
	if err != nil {
		slog.Error("failed to get git status", "session_id", sessionID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get git status"})
		return
	}

	c.JSON(http.StatusOK, status)
}

// HandleGenerateCommitMessage generates a commit message using Claude
func (h *GitHandler) HandleGenerateCommitMessage(c *gin.Context) {
	sessionID := c.Param("id")

	var req GenerateCommitMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Get session
	session, err := h.store.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if session.WorkingDir == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session has no working directory"})
		return
	}

	// Get git status and diff
	status, err := getGitStatus(session.WorkingDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get git status"})
		return
	}

	if !status.HasChanges {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No changes to commit"})
		return
	}

	// Get git diff
	diff, additions, deletions := getGitDiff(session.WorkingDir)

	// Get recent commits for style matching
	recentCommits := getRecentCommits(session.WorkingDir, 5)

	// Build prompt for Claude
	prompt := buildCommitMessagePrompt(req.ConversationContext, status, diff, recentCommits)

	// Call Claude API
	suggestion, err := h.generateWithClaude(c, prompt)
	if err != nil {
		slog.Error("failed to generate commit message", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate commit message"})
		return
	}

	response := GenerateCommitMessageResponse{
		Suggestion: *suggestion,
	}
	response.GitContext.RecentCommits = recentCommits
	response.GitContext.ChangedFileCount = len(status.Staged) + len(status.Unstaged) + len(status.Untracked)
	response.GitContext.AdditionsCount = additions
	response.GitContext.DeletionsCount = deletions

	c.JSON(http.StatusOK, response)
}

// HandleCommitChanges executes git commits
func (h *GitHandler) HandleCommitChanges(c *gin.Context) {
	sessionID := c.Param("id")

	var req CommitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if len(req.Commits) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No commits provided"})
		return
	}

	// Get session
	session, err := h.store.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if session.WorkingDir == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session has no working directory"})
		return
	}

	var response CommitResponse
	response.Success = true

	// Create branch if requested
	if req.CreateBranch != "" {
		if err := createBranch(session.WorkingDir, req.CreateBranch); err != nil {
			response.Success = false
			response.Error = fmt.Sprintf("Failed to create branch: %v", err)
			c.JSON(http.StatusInternalServerError, response)
			return
		}
		response.BranchCreated = req.CreateBranch
	}

	// Stage files if requested
	if req.StageUntracked {
		if err := stageAllChanges(session.WorkingDir); err != nil {
			response.Success = false
			response.Error = fmt.Sprintf("Failed to stage changes: %v", err)
			c.JSON(http.StatusInternalServerError, response)
			return
		}
	} else if len(req.StageFiles) > 0 {
		if err := stageFiles(session.WorkingDir, req.StageFiles); err != nil {
			response.Success = false
			response.Error = fmt.Sprintf("Failed to stage files: %v", err)
			c.JSON(http.StatusInternalServerError, response)
			return
		}
	}

	// Create commits
	for _, commit := range req.Commits {
		// Build commit message
		message := commit.Subject
		if commit.Body != "" {
			message += "\n\n" + commit.Body
		}
		if commit.Footer != "" {
			message += "\n\n" + commit.Footer
		}

		// If specific files are provided for this commit, stage them
		if len(commit.Files) > 0 {
			if err := stageFiles(session.WorkingDir, commit.Files); err != nil {
				response.Success = false
				response.Error = fmt.Sprintf("Failed to stage files for commit: %v", err)
				c.JSON(http.StatusInternalServerError, response)
				return
			}
		}

		// Create commit
		hash, err := createCommit(session.WorkingDir, message)
		if err != nil {
			response.Success = false
			response.Error = fmt.Sprintf("Failed to create commit: %v", err)
			c.JSON(http.StatusInternalServerError, response)
			return
		}
		response.CommitHashes = append(response.CommitHashes, hash)
	}

	c.JSON(http.StatusOK, response)
}

// Helper functions

func isGitRepo(dir string) bool {
	gitDir := filepath.Join(dir, ".git")
	info, err := os.Stat(gitDir)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func runGitCommand(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("%s: %s", err, stderr.String())
	}
	return strings.TrimSpace(stdout.String()), nil
}

func getGitStatus(dir string) (*GitStatusResponse, error) {
	status := &GitStatusResponse{
		Staged:    []GitFile{},
		Unstaged:  []GitFile{},
		Untracked: []GitFile{},
	}

	// Get current branch
	branch, err := runGitCommand(dir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil, err
	}
	status.Branch = branch

	// Get ahead/behind counts
	if upstream, _ := runGitCommand(dir, "rev-parse", "--abbrev-ref", "@{upstream}"); upstream != "" {
		if ahead, _ := runGitCommand(dir, "rev-list", "--count", "@{upstream}..HEAD"); ahead != "" {
			fmt.Sscanf(ahead, "%d", &status.Ahead)
		}
		if behind, _ := runGitCommand(dir, "rev-list", "--count", "HEAD..@{upstream}"); behind != "" {
			fmt.Sscanf(behind, "%d", &status.Behind)
		}
	}

	// Get porcelain status
	output, err := runGitCommand(dir, "status", "--porcelain", "-z")
	if err != nil {
		return nil, err
	}

	if output == "" {
		return status, nil
	}

	// Parse porcelain output (NUL-separated)
	entries := strings.Split(output, "\x00")
	for i := 0; i < len(entries); i++ {
		entry := entries[i]
		if len(entry) < 3 {
			continue
		}

		indexStatus := entry[0]
		workTreeStatus := entry[1]
		path := entry[3:]

		file := GitFile{Path: path}

		// Handle renamed files
		if indexStatus == 'R' || workTreeStatus == 'R' {
			i++
			if i < len(entries) {
				file.OldPath = entries[i]
			}
			file.Status = "renamed"
		}

		// Staged changes
		if indexStatus != ' ' && indexStatus != '?' {
			stagedFile := file
			switch indexStatus {
			case 'A':
				stagedFile.Status = "added"
			case 'M':
				stagedFile.Status = "modified"
			case 'D':
				stagedFile.Status = "deleted"
			case 'R':
				stagedFile.Status = "renamed"
			case 'C':
				stagedFile.Status = "copied"
			}
			status.Staged = append(status.Staged, stagedFile)
		}

		// Unstaged changes
		if workTreeStatus != ' ' && workTreeStatus != '?' {
			unstagedFile := file
			switch workTreeStatus {
			case 'M':
				unstagedFile.Status = "modified"
			case 'D':
				unstagedFile.Status = "deleted"
			}
			status.Unstaged = append(status.Unstaged, unstagedFile)
		}

		// Untracked files
		if indexStatus == '?' && workTreeStatus == '?' {
			file.Status = "untracked"
			status.Untracked = append(status.Untracked, file)
		}
	}

	status.HasChanges = len(status.Staged) > 0 || len(status.Unstaged) > 0 || len(status.Untracked) > 0

	return status, nil
}

func getGitDiff(dir string) (string, int, int) {
	// Get diff for staged and unstaged changes
	diff, _ := runGitCommand(dir, "diff", "--stat", "HEAD")

	// Get line counts
	addDel, _ := runGitCommand(dir, "diff", "--numstat", "HEAD")
	var additions, deletions int
	for _, line := range strings.Split(addDel, "\n") {
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			var a, d int
			fmt.Sscanf(parts[0], "%d", &a)
			fmt.Sscanf(parts[1], "%d", &d)
			additions += a
			deletions += d
		}
	}

	// Truncate diff if too long
	if len(diff) > 5000 {
		diff = diff[:5000] + "\n... (truncated)"
	}

	return diff, additions, deletions
}

func getRecentCommits(dir string, count int) []string {
	output, err := runGitCommand(dir, "log", fmt.Sprintf("-%d", count), "--pretty=format:%s")
	if err != nil {
		return []string{}
	}
	if output == "" {
		return []string{}
	}
	return strings.Split(output, "\n")
}

func createBranch(dir, name string) error {
	_, err := runGitCommand(dir, "checkout", "-b", name)
	return err
}

func stageAllChanges(dir string) error {
	_, err := runGitCommand(dir, "add", "-A")
	return err
}

func stageFiles(dir string, files []string) error {
	args := append([]string{"add"}, files...)
	_, err := runGitCommand(dir, args...)
	return err
}

func createCommit(dir, message string) (string, error) {
	_, err := runGitCommand(dir, "commit", "-m", message)
	if err != nil {
		return "", err
	}
	// Get the commit hash
	hash, err := runGitCommand(dir, "rev-parse", "HEAD")
	if err != nil {
		return "", err
	}
	return hash[:8], nil // Return short hash
}

func buildCommitMessagePrompt(ctx *ConversationContext, status *GitStatusResponse, diff string, recentCommits []string) string {
	var sb strings.Builder

	sb.WriteString("Generate a commit message for the following changes. ")
	sb.WriteString("You have access to the conversation context from the AI coding session that produced these changes.\n\n")

	// Session context
	if ctx != nil {
		sb.WriteString("## Session Intent\n")
		sb.WriteString(fmt.Sprintf("Original Request: %s\n", ctx.OriginalQuery))
		if ctx.SessionSummary != "" {
			sb.WriteString(fmt.Sprintf("Session Summary: %s\n", ctx.SessionSummary))
		}

		if len(ctx.KeyDecisions) > 0 {
			sb.WriteString("\n## Key Decisions Made\n")
			for _, d := range ctx.KeyDecisions {
				sb.WriteString(fmt.Sprintf("- %s\n", d))
			}
		}

		if len(ctx.UserIntents) > 0 {
			sb.WriteString("\n## User Feedback During Session\n")
			for _, intent := range ctx.UserIntents {
				sb.WriteString(fmt.Sprintf("- %s\n", intent))
			}
		}

		if len(ctx.FilesModified) > 0 {
			sb.WriteString("\n## Files Changed (with purpose)\n")
			for _, f := range ctx.FilesModified {
				sb.WriteString(fmt.Sprintf("- %s (%s)", f.Path, f.Action))
				if f.Purpose != "" {
					sb.WriteString(fmt.Sprintf(": %s", f.Purpose))
				}
				sb.WriteString("\n")
			}
		}

		if len(ctx.IssueReferences) > 0 {
			sb.WriteString("\n## Issue References Found\n")
			sb.WriteString(strings.Join(ctx.IssueReferences, ", "))
			sb.WriteString("\n")
		}
	}

	// Git context
	sb.WriteString("\n## Git Status\n")
	sb.WriteString(fmt.Sprintf("Branch: %s\n", status.Branch))
	sb.WriteString(fmt.Sprintf("Staged: %d files\n", len(status.Staged)))
	sb.WriteString(fmt.Sprintf("Unstaged: %d files\n", len(status.Unstaged)))
	sb.WriteString(fmt.Sprintf("Untracked: %d files\n", len(status.Untracked)))

	sb.WriteString("\n## Git Diff Summary\n")
	sb.WriteString(diff)

	if len(recentCommits) > 0 {
		sb.WriteString("\n\n## Recent Commits (for style consistency)\n")
		for _, c := range recentCommits {
			sb.WriteString(fmt.Sprintf("- %s\n", c))
		}
	}

	// Instructions
	sb.WriteString(`

## Instructions
Generate a commit message that captures not just WHAT changed, but WHY it changed.

1. Subject line (~50 chars, imperative mood, capitalized, no period):
   - Use type prefix: feat/fix/docs/style/refactor/test/chore
   - Include scope in parentheses if clear from files
   - Reflect the user's original intent

2. Body (optional, wrapped at 72 chars):
   - Explain the problem solved
   - Briefly describe the approach

3. Footer (optional):
   - Include issue references if found
   - Note breaking changes

4. Determine if changes should be:
   - "single": Related changes with single intent
   - "multiple": Multiple distinct tasks
   - "branch": Major feature or breaking changes

Respond ONLY with valid JSON (no markdown code blocks):
{
  "type": "single",
  "branchName": "",
  "reasoning": "Brief explanation",
  "commits": [
    {
      "subject": "type(scope): description",
      "body": "Optional longer description",
      "footer": "Closes #123",
      "files": ["file1.ts", "file2.ts"]
    }
  ]
}`)

	return sb.String()
}

func (h *GitHandler) generateWithClaude(c *gin.Context, prompt string) (*CommitSuggestion, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}

	payload := map[string]interface{}{
		"model":      "claude-sonnet-4-20250514",
		"max_tokens": 2048,
		"system":     "You are a git commit message generator. Generate clear, conventional commit messages.",
		"messages": []map[string]string{
			{
				"role":    "user",
				"content": prompt,
			},
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		slog.Error("Anthropic API error", "status_code", resp.StatusCode, "response", string(respBody))
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	// Parse Claude response
	var anthropicResp struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}

	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Extract text
	var text string
	for _, content := range anthropicResp.Content {
		if content.Type == "text" {
			text = content.Text
			break
		}
	}

	// Clean up response (remove markdown code blocks if present)
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	// Parse JSON response
	var suggestion CommitSuggestion
	if err := json.Unmarshal([]byte(text), &suggestion); err != nil {
		slog.Error("failed to parse commit suggestion", "error", err, "text", text)
		// Return a default suggestion
		return &CommitSuggestion{
			Type:      "single",
			Reasoning: "Failed to parse AI response, using default",
			Commits: []CommitMessage{
				{
					Subject: "chore: Update files",
					Files:   []string{},
				},
			},
		}, nil
	}

	return &suggestion, nil
}
