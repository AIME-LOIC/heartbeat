package main

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Project defines our service monitoring structure
type Project struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	URL         string  `json:"url"`
	Language    string  `json:"language"`
	Status      string  `json:"status"`
	Latency     int64   `json:"latency"`
	Uptime      float64 `json:"uptime"`
	LastChecked string  `json:"lastChecked"`
}

// Global list of projects to monitor
var projects = []Project{
	{ID: "1", Name: "Google", URL: "https://www.google.com", Language: "Go", Uptime: 99.9},
	{ID: "2", Name: "GitHub", URL: "https://github.com", Language: "Python", Uptime: 99.8},
	{ID: "3", Name: "Local-Vite", URL: "http://localhost:5173", Language: "TypeScript", Uptime: 100.0},
	{ID: "4", Name: "Invalid-Service", URL: "https://this-will-fail-404.com", Language: "Java", Uptime: 0.0},
}

// CORSMiddleware allows our React frontend to talk to this API
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// pingService performs the actual HTTP check concurrently
func pingService(p *Project, wg *sync.WaitGroup) {
	defer wg.Done()

	start := time.Now()
	client := http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Get(p.URL)
	p.Latency = time.Since(start).Milliseconds()
	p.LastChecked = time.Now().Format("15:04:05")

	if err != nil || resp.StatusCode >= 400 {
		p.Status = "DOWN"
		p.Latency = 0
	} else {
		p.Status = "HEALTHY"
		if p.Latency > 500 {
			p.Status = "DEGRADED"
		}
	}
}

func main() {
	// Create a Gin router with default logging/recovery middleware
	r := gin.Default()

	// Apply CORS so React can connect
	r.Use(CORSMiddleware())

	// API Route
	r.GET("/api/v1/status", func(c *gin.Context) {
		var wg sync.WaitGroup
		
		// Create a fresh copy for the request to avoid data races
		activeResults := make([]Project, len(projects))
		copy(activeResults, projects)

		for i := range activeResults {
			wg.Add(1)
			go pingService(&activeResults[i], &wg)
		}

		wg.Wait()
		c.JSON(http.StatusOK, activeResults)
	})

	// Run on 8080
	r.Run(":8080")
}