package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/humanlayer/humanlayer/claudecode-go"
	"github.com/humanlayer/humanlayer/hld/store"
)

// EphemeralChatHandler handles ephemeral (non-persistent) chat requests
type EphemeralChatHandler struct {
	store        store.ConversationStore
	claudeClient *claudecode.Client
}

// NewEphemeralChatHandler creates a new ephemeral chat handler
func NewEphemeralChatHandler(conversationStore store.ConversationStore) *EphemeralChatHandler {
	client, err := claudecode.NewClient()
	if err != nil {
		slog.Warn("failed to create claude client for ephemeral chat", "error", err)
		// Client will be nil, we'll check for this in the handler
	}
	return &EphemeralChatHandler{
		store:        conversationStore,
		claudeClient: client,
	}
}

// EphemeralChatRequest represents an ephemeral chat request
type EphemeralChatRequest struct {
	Message string `json:"message"`
	Context struct {
		IncludeRecentEvents bool `json:"include_recent_events"`
		MaxEvents           int  `json:"max_events"`
	} `json:"context"`
}

// EphemeralChatResponse represents an ephemeral chat response
type EphemeralChatResponse struct {
	Content string `json:"content"`
}

// HandleEphemeralChat processes an ephemeral chat request
// This endpoint uses Claude Code to make AI requests WITHOUT persisting to conversation history
func (h *EphemeralChatHandler) HandleEphemeralChat(c *gin.Context) {
	startTime := time.Now()
	sessionID := c.Param("session_id")

	slog.Info("ephemeral chat request received",
		"session_id", sessionID,
		"start_time", startTime)

	// Check if claude client is available
	if h.claudeClient == nil {
		slog.Error("claude client not available for ephemeral chat")
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Claude Code not available"})
		return
	}

	// Parse request body
	var req EphemeralChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		slog.Error("invalid ephemeral chat request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}

	// Default context settings
	if req.Context.MaxEvents == 0 {
		req.Context.MaxEvents = 20
	}

	// Fetch session for context
	session, err := h.store.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		slog.Error("session not found for ephemeral chat",
			"session_id", sessionID,
			"error", err)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Build context from session
	var contextParts []string
	contextParts = append(contextParts, fmt.Sprintf("Session Query: %s", session.Query))
	if session.Summary != "" {
		contextParts = append(contextParts, fmt.Sprintf("Session Summary: %s", session.Summary))
	}
	if session.WorkingDir != "" {
		contextParts = append(contextParts, fmt.Sprintf("Working Directory: %s", session.WorkingDir))
	}
	contextParts = append(contextParts, fmt.Sprintf("Session Status: %s", session.Status))

	// Optionally include recent conversation events
	if req.Context.IncludeRecentEvents {
		events, err := h.store.GetSessionConversation(c.Request.Context(), sessionID)
		if err == nil && len(events) > 0 {
			// Take last N events
			startIdx := 0
			if len(events) > req.Context.MaxEvents {
				startIdx = len(events) - req.Context.MaxEvents
			}
			recentEvents := events[startIdx:]

			var eventSummaries []string
			for _, event := range recentEvents {
				if event.EventType == "message" && event.Content != "" {
					role := "User"
					if event.Role == "assistant" {
						role = "Assistant"
					}
					// Truncate long messages
					content := event.Content
					if len(content) > 500 {
						content = content[:500] + "..."
					}
					eventSummaries = append(eventSummaries, fmt.Sprintf("%s: %s", role, content))
				} else if event.EventType == "tool_call" && event.ToolName != "" {
					eventSummaries = append(eventSummaries, fmt.Sprintf("Tool Call: %s", event.ToolName))
				}
			}
			if len(eventSummaries) > 0 {
				contextParts = append(contextParts, fmt.Sprintf("\nRecent Conversation:\n%s", strings.Join(eventSummaries, "\n")))
			}
		}
	}

	sessionContext := strings.Join(contextParts, "\n")

	// Build the query with context
	query := fmt.Sprintf(`You are answering a clarifying question about a coding session.
The user is reviewing a session and wants to understand what's happening before making a decision.
Provide concise, helpful answers based on the context below.

Session Context:
%s

User's Question: %s

Important: Keep your response focused and concise. This is an ephemeral chat.`, sessionContext, req.Message)

	// Launch Claude Code process for the ephemeral query
	response, err := h.runEphemeralQuery(session, query)
	if err != nil {
		slog.Error("ephemeral chat query failed",
			"session_id", sessionID,
			"error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get AI response"})
		return
	}

	slog.Info("ephemeral chat completed",
		"session_id", sessionID,
		"duration_ms", time.Since(startTime).Milliseconds())

	c.JSON(http.StatusOK, EphemeralChatResponse{
		Content: response,
	})
}

// runEphemeralQuery launches a lightweight Claude Code process to handle the query
func (h *EphemeralChatHandler) runEphemeralQuery(session *store.Session, query string) (string, error) {
	// Build config for ephemeral query
	config := claudecode.SessionConfig{
		Query:        query,
		Model:        claudecode.ModelSonnet, // Use Sonnet for good quality/speed balance
		OutputFormat: claudecode.OutputJSON,  // JSON for easier parsing
		MaxTurns:     1,                      // Single turn for quick response
		WorkingDir:   session.WorkingDir,     // Use session's working directory for context
	}

	// If session has a claude_session_id, we can fork from it for context
	// But for ephemeral chat, we typically want a fresh context with just the summary
	// Forking could be expensive and include full conversation history
	// So we'll use a fresh session with the context in the query

	slog.Debug("launching ephemeral claude query",
		"session_id", session.ID,
		"working_dir", session.WorkingDir)

	// Launch and wait for result
	result, err := h.claudeClient.LaunchAndWait(config)
	if err != nil {
		return "", fmt.Errorf("failed to run claude query: %w", err)
	}

	if result.IsError {
		return "", fmt.Errorf("claude returned error: %s", result.Error)
	}

	return result.Result, nil
}
