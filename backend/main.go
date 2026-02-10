package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
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
	ConfirmStorePath       string

	EmailJSServiceID  string
	EmailJSTemplateID string
	EmailJSPublicKey  string
	EmailJSPrivateKey string
}

func loadConfig() (Config, error) {
	loadDotEnvIfPresent(".env")
	// Allow running from repo root (where backend/.env exists).
	if _, err := os.Stat(".env"); err != nil {
		loadDotEnvIfPresent("backend/.env")
	}
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
	cfg.ConfirmStorePath = strings.TrimSpace(os.Getenv("CONFIRM_STORE_PATH"))
	if cfg.ConfirmStorePath == "" {
		cfg.ConfirmStorePath = ".confirm_store.json"
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
	confirmedEmails map[string]int64
	confirmStorePath string
	rateBuckets     map[string][]int64
}

func NewStore(cfg Config) *Store {
	s := &Store{
		historyByID:    make(map[string][]CheckResult),
		lastStatusByID: make(map[string]string),
		confirmedEmails: make(map[string]int64),
		confirmStorePath: cfg.ConfirmStorePath,
		rateBuckets:     make(map[string][]int64),
	}
	s.loadConfirmedFromDisk()
	return s
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

func (s *Store) loadConfirmedFromDisk() {
	if s.confirmStorePath == "" {
		return
	}
	b, err := os.ReadFile(s.confirmStorePath)
	if err != nil {
		return
	}
	var m map[string]int64
	if err := json.Unmarshal(b, &m); err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, v := range m {
		s.confirmedEmails[strings.ToLower(strings.TrimSpace(k))] = v
	}
}

func (s *Store) persistConfirmedToDiskLocked() {
	if s.confirmStorePath == "" {
		return
	}
	tmp := s.confirmStorePath + ".tmp"
	b, _ := json.MarshalIndent(s.confirmedEmails, "", "  ")
	_ = os.WriteFile(tmp, b, 0o600)
	_ = os.Rename(tmp, s.confirmStorePath)
}

func (s *Store) isConfirmed(email string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.confirmedEmails[strings.ToLower(strings.TrimSpace(email))]
	return ok
}

func (s *Store) markConfirmed(email string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.confirmedEmails[strings.ToLower(strings.TrimSpace(email))] = time.Now().UnixMilli()
	s.persistConfirmedToDiskLocked()
}

func (s *Store) allowAction(key string, window time.Duration, limit int) bool {
	now := time.Now().UnixMilli()
	cutoff := now - window.Milliseconds()

	s.mu.Lock()
	defer s.mu.Unlock()

	items := s.rateBuckets[key]
	filtered := items[:0]
	for _, ts := range items {
		if ts >= cutoff {
			filtered = append(filtered, ts)
		}
	}
	if len(filtered) >= limit {
		s.rateBuckets[key] = filtered
		return false
	}
	filtered = append(filtered, now)
	s.rateBuckets[key] = filtered
	return true
}

type ConfirmTokenPayload struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Exp      int64  `json:"exp"`
	Nonce    string `json:"nonce"`
}

func randomNonce() (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func signConfirmToken(secret string, payload ConfirmTokenPayload) (string, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	msg := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return msg + "." + sig, nil
}

func verifyConfirmToken(secret string, token string) (ConfirmTokenPayload, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return ConfirmTokenPayload{}, false
	}
	msg := parts[0]
	sig := parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	want := mac.Sum(nil)
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(want, got) {
		return ConfirmTokenPayload{}, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(msg)
	if err != nil {
		return ConfirmTokenPayload{}, false
	}
	var p ConfirmTokenPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return ConfirmTokenPayload{}, false
	}
	if p.Exp <= 0 || time.Now().Unix() > p.Exp {
		return ConfirmTokenPayload{}, false
	}
	if strings.TrimSpace(p.Email) == "" {
		return ConfirmTokenPayload{}, false
	}
	return p, true
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
	store := NewStore(cfg)

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

		// Basic rate limiting to reduce abuse when EmailJS is called from the browser.
		ip := c.ClientIP()
		if !store.allowAction("confirm:ip:"+ip, 1*time.Minute, 10) {
			c.JSON(429, gin.H{"ok": false, "error": "too many requests"})
			return
		}
		if !store.allowAction("confirm:email:"+strings.ToLower(email), 10*time.Minute, 5) {
			c.JSON(429, gin.H{"ok": false, "error": "too many requests"})
			return
		}

		nonce, err := randomNonce()
		if err != nil {
			c.JSON(500, gin.H{"error": "could not create token"})
			return
		}
		exp := time.Now().Add(time.Duration(cfg.ConfirmTokenTTLMinutes) * time.Minute).Unix()
		token, err := signConfirmToken(cfg.ConfirmTokenSecret, ConfirmTokenPayload{
			Email:    email,
			Username: username,
			Exp:      exp,
			Nonce:    nonce,
		})
		if err != nil {
			c.JSON(500, gin.H{"error": "could not create token"})
			return
		}
		confirmLink := cfg.ConfirmBaseURL + "/confirm?token=" + url.QueryEscape(token) + "&email=" + url.QueryEscape(email)
		if username != "" {
			confirmLink += "&username=" + url.QueryEscape(username)
		}
		// The browser sends via EmailJS (EmailJS blocks non-browser apps on some accounts).
		c.JSON(200, gin.H{"ok": true, "expiresAt": exp, "confirmLink": confirmLink})
	})

	r.GET("/api/v1/auth/confirm", func(c *gin.Context) {
		token := strings.TrimSpace(c.Query("token"))
		if token == "" {
			c.JSON(400, gin.H{"error": "token is required"})
			return
		}
		ct, ok := verifyConfirmToken(cfg.ConfirmTokenSecret, token)
		if !ok {
			c.JSON(400, gin.H{"ok": false, "error": "invalid or expired token"})
			return
		}
		store.markConfirmed(ct.Email)
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
