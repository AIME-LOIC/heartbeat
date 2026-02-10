package main

import (
	"crypto/rand"
	"encoding/json"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"net/url"
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

	ConfirmBaseURL         string
	ConfirmTokenTTLMinutes int
	ConfirmTokenSecret     string

	EmailJSServiceID  string
	EmailJSTemplateID string
	EmailJSPublicKey  string
	EmailJSPrivateKey string
}

func loadConfig() (Config, error) {
	loadDotEnvIfPresent(".env")
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

	cfg.ConfirmBaseURL = strings.TrimRight(strings.TrimSpace(os.Getenv("CONFIRM_BASE_URL")), "/")
	if cfg.ConfirmBaseURL == "" {
		cfg.ConfirmBaseURL = "http://localhost:5173"
	}
	cfg.ConfirmTokenSecret = strings.TrimSpace(os.Getenv("CONFIRM_TOKEN_SECRET"))
	if cfg.ConfirmTokenSecret == "" {
		cfg.ConfirmTokenSecret = "dev-only-change-me"
	}
	ttlStr := strings.TrimSpace(os.Getenv("CONFIRM_TOKEN_TTL_MINUTES"))
	if ttlStr == "" {
		cfg.ConfirmTokenTTLMinutes = 30
	} else {
		ttl, err := strconv.Atoi(ttlStr)
		if err != nil || ttl < 5 || ttl > 24*60 {
			return Config{}, fmt.Errorf("invalid CONFIRM_TOKEN_TTL_MINUTES")
		}
		cfg.ConfirmTokenTTLMinutes = ttl
	}

	cfg.EmailJSServiceID = strings.TrimSpace(os.Getenv("EMAILJS_SERVICE_ID"))
	cfg.EmailJSTemplateID = strings.TrimSpace(os.Getenv("EMAILJS_TEMPLATE_ID"))
	cfg.EmailJSPublicKey = strings.TrimSpace(os.Getenv("EMAILJS_PUBLIC_KEY"))
	cfg.EmailJSPrivateKey = strings.TrimSpace(os.Getenv("EMAILJS_PRIVATE_KEY"))
	return cfg, nil
}

func loadDotEnvIfPresent(path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	lines := strings.Split(string(b), "\n")
	for _, line := range lines {
		l := strings.TrimSpace(line)
		if l == "" || strings.HasPrefix(l, "#") {
			continue
		}
		parts := strings.SplitN(l, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		_ = os.Setenv(key, val)
	}
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

	confirmTokens   map[string]ConfirmToken
	confirmedEmails map[string]time.Time
}

type ConfirmToken struct {
	Email     string
	Username  string
	ExpiresAt time.Time
}

func NewStore() *Store {
	return &Store{
		historyByID:    make(map[string][]CheckResult),
		lastStatusByID: make(map[string]string),
		confirmTokens:  make(map[string]ConfirmToken),
		confirmedEmails: make(map[string]time.Time),
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

func (s *Store) createConfirmToken(email string, username string, ttl time.Duration) (string, time.Time, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	expiresAt := time.Now().Add(ttl)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.confirmTokens[token] = ConfirmToken{Email: email, Username: username, ExpiresAt: expiresAt}
	return token, expiresAt, nil
}

func (s *Store) consumeConfirmToken(token string) (ConfirmToken, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ct, ok := s.confirmTokens[token]
	if !ok {
		return ConfirmToken{}, false
	}
	if time.Now().After(ct.ExpiresAt) {
		delete(s.confirmTokens, token)
		return ConfirmToken{}, false
	}
	delete(s.confirmTokens, token)
	s.confirmedEmails[strings.ToLower(ct.Email)] = time.Now()
	return ct, true
}

func (s *Store) isConfirmed(email string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.confirmedEmails[strings.ToLower(email)]
	return ok
}

func sendEmailJSConfirmation(cfg Config, toEmail string, confirmLink string, username string) error {
	if cfg.EmailJSServiceID == "" || cfg.EmailJSTemplateID == "" || cfg.EmailJSPublicKey == "" {
		return fmt.Errorf("emailjs is not configured")
	}

	payload := map[string]any{
		"service_id":  cfg.EmailJSServiceID,
		"template_id": cfg.EmailJSTemplateID,
		"user_id":     cfg.EmailJSPublicKey,
		"template_params": map[string]string{
			"to_email":           toEmail,
			"confirmation_link":  confirmLink,
			"username":           username,
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.emailjs.com/api/v1.0/email/send", strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.EmailJSPrivateKey != "" {
		// Some EmailJS setups use a private key/bearer token for server-side calls.
		req.Header.Set("Authorization", "Bearer "+cfg.EmailJSPrivateKey)
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("emailjs returned status %d", resp.StatusCode)
	}
	return nil
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

	r.POST("/api/v1/auth/send-confirmation", func(c *gin.Context) {
		var req struct {
			Email    string `json:"email"`
			Username string `json:"username"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid json"})
			return
		}
		email := strings.TrimSpace(req.Email)
		username := strings.TrimSpace(req.Username)
		if email == "" || !strings.Contains(email, "@") {
			c.JSON(400, gin.H{"error": "email is required"})
			return
		}
		if store.isConfirmed(email) {
			c.JSON(200, gin.H{"ok": true, "alreadyConfirmed": true})
			return
		}

		ttl := time.Duration(cfg.ConfirmTokenTTLMinutes) * time.Minute
		token, expiresAt, err := store.createConfirmToken(email, username, ttl)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not create token"})
			return
		}
		confirmLink := cfg.ConfirmBaseURL + "/confirm?token=" + url.QueryEscape(token) + "&email=" + url.QueryEscape(email)
		if username != "" {
			confirmLink += "&username=" + url.QueryEscape(username)
		}
		if err := sendEmailJSConfirmation(cfg, email, confirmLink, username); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true, "expiresAt": expiresAt.UnixMilli()})
	})

	r.GET("/api/v1/auth/confirm", func(c *gin.Context) {
		token := strings.TrimSpace(c.Query("token"))
		if token == "" {
			c.JSON(400, gin.H{"error": "token is required"})
			return
		}
		ct, ok := store.consumeConfirmToken(token)
		if !ok {
			c.JSON(400, gin.H{"ok": false, "error": "invalid or expired token"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "email": ct.Email, "username": ct.Username})
	})

	r.GET("/api/v1/auth/is-confirmed", func(c *gin.Context) {
		email := strings.TrimSpace(c.Query("email"))
		if email == "" {
			c.JSON(400, gin.H{"error": "email is required"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "confirmed": store.isConfirmed(email)})
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
