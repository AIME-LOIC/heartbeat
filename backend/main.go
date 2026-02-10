package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type Config struct {
	SupabaseURL    string
	SupabaseAnonKey string
	Port           string
	CORSOrigin     string
	PingTimeout    time.Duration
	PingRetries    int
	PingRetryDelay time.Duration
	DegradedMs     int64
	WebhookURL     string
	SlackWebhookURL   string
	DiscordWebhookURL string
}

func loadConfig() (Config, error) {
	cfg := Config{
		Port:       os.Getenv("PORT"),
		CORSOrigin: os.Getenv("CORS_ORIGIN"),
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.CORSOrigin == "" {
		cfg.CORSOrigin = "*"
	}

	cfg.SupabaseURL = os.Getenv("SUPABASE_URL")
	cfg.SupabaseAnonKey = os.Getenv("SUPABASE_ANON_KEY")
	if cfg.SupabaseURL == "" || cfg.SupabaseAnonKey == "" {
		return Config{}, fmt.Errorf("missing SUPABASE_URL or SUPABASE_ANON_KEY")
	}

	timeoutMsStr := os.Getenv("PING_TIMEOUT_MS")
	if timeoutMsStr == "" {
		cfg.PingTimeout = 5 * time.Second
	} else {
		timeoutMs, err := strconv.Atoi(timeoutMsStr)
		if err != nil || timeoutMs <= 0 {
			return Config{}, fmt.Errorf("invalid PING_TIMEOUT_MS")
		}
		cfg.PingTimeout = time.Duration(timeoutMs) * time.Millisecond
	}

	retriesStr := os.Getenv("PING_RETRIES")
	if retriesStr == "" {
		cfg.PingRetries = 1
	} else {
		retries, err := strconv.Atoi(retriesStr)
		if err != nil || retries < 1 || retries > 5 {
			return Config{}, fmt.Errorf("invalid PING_RETRIES")
		}
		cfg.PingRetries = retries
	}

	retryDelayStr := os.Getenv("PING_RETRY_DELAY_MS")
	if retryDelayStr == "" {
		cfg.PingRetryDelay = 200 * time.Millisecond
	} else {
		delayMs, err := strconv.Atoi(retryDelayStr)
		if err != nil || delayMs < 0 || delayMs > 10_000 {
			return Config{}, fmt.Errorf("invalid PING_RETRY_DELAY_MS")
		}
		cfg.PingRetryDelay = time.Duration(delayMs) * time.Millisecond
	}

	degradedStr := os.Getenv("DEGRADED_LATENCY_MS")
	if degradedStr == "" {
		cfg.DegradedMs = 1200
	} else {
		ms, err := strconv.Atoi(degradedStr)
		if err != nil || ms <= 0 {
			return Config{}, fmt.Errorf("invalid DEGRADED_LATENCY_MS")
		}
		cfg.DegradedMs = int64(ms)
	}

	cfg.WebhookURL = strings.TrimSpace(os.Getenv("WEBHOOK_URL"))
	cfg.SlackWebhookURL = strings.TrimSpace(os.Getenv("SLACK_WEBHOOK_URL"))
	cfg.DiscordWebhookURL = strings.TrimSpace(os.Getenv("DISCORD_WEBHOOK_URL"))
	return cfg, nil
}

type Project struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Status  string `json:"status"`
	Latency int64  `json:"latency"`
}

type CheckResult struct {
	TS        int64  `json:"ts"`
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency"`
	Code      int    `json:"code"`
	Error     string `json:"error,omitempty"`
}

type Incident struct {
	ID          string `json:"id"`
	TS          int64  `json:"ts"`
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	Status      string `json:"status"`
	Message     string `json:"message"`
}

func CORSMiddleware(origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, apikey, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

type Store struct {
	mu              sync.Mutex
	historyByID     map[string][]CheckResult
	lastStatusByID  map[string]string
	incidents       []Incident
}

func NewStore() *Store {
	return &Store{
		historyByID:    make(map[string][]CheckResult),
		lastStatusByID: make(map[string]string),
	}
}

func (s *Store) addCheck(project Project, check CheckResult) *Incident {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing := s.historyByID[project.ID]
	existing = append(existing, check)
	if len(existing) > 500 {
		existing = existing[len(existing)-500:]
	}
	s.historyByID[project.ID] = existing

	prevStatus, ok := s.lastStatusByID[project.ID]
	s.lastStatusByID[project.ID] = check.Status
	if ok && prevStatus != check.Status {
		incident := Incident{
			ID:          fmt.Sprintf("%d_%s_%s", time.Now().UnixMilli(), project.ID, check.Status),
			TS:          time.Now().UnixMilli(),
			ProjectID:   project.ID,
			ProjectName: project.Name,
			Status:      check.Status,
			Message:     statusMessage(check.Status),
		}
		s.incidents = append([]Incident{incident}, s.incidents...)
		if len(s.incidents) > 200 {
			s.incidents = s.incidents[:200]
		}
		return &incident
	}
	return nil
}

func statusMessage(status string) string {
	switch status {
	case "DOWN":
		return "Service went DOWN"
	case "HEALTHY":
		return "Service recovered"
	case "DEGRADED":
		return "Service is DEGRADED"
	default:
		return "Status changed"
	}
}

func (s *Store) getHistory(projectID string, limit int) []CheckResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	h := s.historyByID[projectID]
	if limit <= 0 || limit > len(h) {
		limit = len(h)
	}
	out := make([]CheckResult, limit)
	copy(out, h[len(h)-limit:])
	return out
}

func (s *Store) getIncidents(limit int) []Incident {
	s.mu.Lock()
	defer s.mu.Unlock()
	if limit <= 0 || limit > len(s.incidents) {
		limit = len(s.incidents)
	}
	out := make([]Incident, limit)
	copy(out, s.incidents[:limit])
	return out
}

func doWebhook(cfg Config, incident Incident) {
	payload := map[string]any{
		"id":          incident.ID,
		"ts":          incident.TS,
		"projectId":   incident.ProjectID,
		"projectName": incident.ProjectName,
		"status":      incident.Status,
		"message":     incident.Message,
	}
	body, _ := json.Marshal(payload)

	post := func(url string, raw []byte) {
		if strings.TrimSpace(url) == "" {
			return
		}
		req, err := http.NewRequest("POST", url, strings.NewReader(string(raw)))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{Timeout: 5 * time.Second}
		_, _ = client.Do(req)
	}

	// Generic webhook (JSON)
	post(cfg.WebhookURL, body)

	// Slack expects { "text": "..." }
	if cfg.SlackWebhookURL != "" {
		slackBody, _ := json.Marshal(map[string]string{
			"text": fmt.Sprintf("*Heartbeat* %s — %s", incident.ProjectName, incident.Message),
		})
		post(cfg.SlackWebhookURL, slackBody)
	}

	// Discord expects { "content": "..." }
	if cfg.DiscordWebhookURL != "" {
		discordBody, _ := json.Marshal(map[string]string{
			"content": fmt.Sprintf("**Heartbeat** %s — %s", incident.ProjectName, incident.Message),
		})
		post(cfg.DiscordWebhookURL, discordBody)
	}
}

func pingService(p *Project, cfg Config, store *Store, wg *sync.WaitGroup) {
	defer wg.Done()
	client := http.Client{Timeout: cfg.PingTimeout}

	var lastErr error
	var lastCode int
	var latencyMs int64

	for attempt := 0; attempt < cfg.PingRetries; attempt++ {
		start := time.Now()
		resp, err := client.Get(p.URL)
		latencyMs = time.Since(start).Milliseconds()
		if err == nil {
			lastCode = resp.StatusCode
		}
		if err == nil && resp.StatusCode < 400 {
			lastErr = nil
			break
		}
		lastErr = err
		if attempt < cfg.PingRetries-1 && cfg.PingRetryDelay > 0 {
			time.Sleep(cfg.PingRetryDelay)
		}
	}

	p.Latency = latencyMs
	if lastErr != nil || lastCode >= 400 {
		p.Status = "DOWN"
		p.Latency = 0
		check := CheckResult{
			TS:        time.Now().UnixMilli(),
			Status:    "DOWN",
			LatencyMs: 0,
			Code:      lastCode,
		}
		if lastErr != nil {
			check.Error = lastErr.Error()
		}
		if incident := store.addCheck(*p, check); incident != nil {
			go doWebhook(cfg, *incident)
		}
		return
	}

	if p.Latency >= cfg.DegradedMs {
		p.Status = "DEGRADED"
	} else {
		p.Status = "HEALTHY"
	}
	check := CheckResult{
		TS:        time.Now().UnixMilli(),
		Status:    p.Status,
		LatencyMs: p.Latency,
		Code:      lastCode,
	}
	if incident := store.addCheck(*p, check); incident != nil {
		go doWebhook(cfg, *incident)
	}
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		panic(err)
	}

	r := gin.Default()
	r.Use(CORSMiddleware(cfg.CORSOrigin))
	store := NewStore()

	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"name":  "heartbeat-backend",
			"ok":    true,
			"routes": []string{"/api/v1/health", "/api/v1/status", "/api/v1/incidents", "/api/v1/history"},
		})
	})

	r.GET("/api/v1/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	r.GET("/api/v1/status", func(c *gin.Context) {
		client := &http.Client{Timeout: 10 * time.Second}
		req, _ := http.NewRequest("GET", cfg.SupabaseURL+"/rest/v1/projects?select=*", nil)
		req.Header.Set("apikey", cfg.SupabaseAnonKey)
		req.Header.Set("Authorization", "Bearer "+cfg.SupabaseAnonKey)

		resp, err := client.Do(req)
		if err != nil {
			c.JSON(500, gin.H{"error": "Supabase connection error"})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			c.JSON(500, gin.H{"error": "Supabase returned non-OK", "status": resp.StatusCode})
			return
		}

		var projects []Project
		json.NewDecoder(resp.Body).Decode(&projects)

		var wg sync.WaitGroup
		for i := range projects {
			wg.Add(1)
			go pingService(&projects[i], cfg, store, &wg)
		}
		wg.Wait()

		c.JSON(200, projects)
	})

	r.GET("/api/v1/history", func(c *gin.Context) {
		projectID := strings.TrimSpace(c.Query("project_id"))
		if projectID == "" {
			c.JSON(400, gin.H{"error": "project_id is required"})
			return
		}
		limit := 48
		if limStr := c.Query("limit"); limStr != "" {
			if lim, err := strconv.Atoi(limStr); err == nil && lim > 0 && lim <= 500 {
				limit = lim
			}
		}
		c.JSON(200, gin.H{"projectId": projectID, "items": store.getHistory(projectID, limit)})
	})

	r.GET("/api/v1/incidents", func(c *gin.Context) {
		limit := 50
		if limStr := c.Query("limit"); limStr != "" {
			if lim, err := strconv.Atoi(limStr); err == nil && lim > 0 && lim <= 200 {
				limit = lim
			}
		}
		c.JSON(200, gin.H{"items": store.getIncidents(limit)})
	})

	r.Run(":" + cfg.Port)
}
