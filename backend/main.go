package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
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
		return cfg, nil
	}
	timeoutMs, err := strconv.Atoi(timeoutMsStr)
	if err != nil || timeoutMs <= 0 {
		return Config{}, fmt.Errorf("invalid PING_TIMEOUT_MS")
	}
	cfg.PingTimeout = time.Duration(timeoutMs) * time.Millisecond
	return cfg, nil
}

type Project struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Status  string `json:"status"`
	Latency int64  `json:"latency"`
}

func CORSMiddleware(origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, apikey, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func pingService(p *Project, timeout time.Duration, wg *sync.WaitGroup) {
	defer wg.Done()
	start := time.Now()
	client := http.Client{Timeout: timeout}
	
	resp, err := client.Get(p.URL)
	p.Latency = time.Since(start).Milliseconds()

	if err != nil || resp.StatusCode >= 400 {
		p.Status = "DOWN"
		p.Latency = 0
	} else {
		p.Status = "HEALTHY"
	}
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		panic(err)
	}

	r := gin.Default()
	r.Use(CORSMiddleware(cfg.CORSOrigin))

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
			go pingService(&projects[i], cfg.PingTimeout, &wg)
		}
		wg.Wait()

		c.JSON(200, projects)
	})

	r.Run(":" + cfg.Port)
}
