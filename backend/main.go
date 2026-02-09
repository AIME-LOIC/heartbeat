package main

import (
	"net/http"
	"time"
	"sync"

	"github.com/gin-gonic/gin"
)

type Project struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	URL         string  `json:"url"` // The real URL to ping
	Language    string  `json:"language"`
	Status      string  `json:"status"`
	Latency     int64   `json:"latency"`
	Uptime      float64 `json:"uptime"`
	LastChecked string  `json:"lastChecked"`
}

// Global list of projects to monitor
var projects = []Project{
	{ID: "1", Name: "Google", URL: "https://www.google.com", Language: "Go"},
	{ID: "2", Name: "GitHub", URL: "https://github.com", Language: "Python"},
	{ID: "3", Name: "Invalid-Test", URL: "https://this-should-fail-123.com", Language: "Java"},
}

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

func getProjectStatus(c *gin.Context) {
	var wg sync.WaitGroup
	
	// Copy current state to work on fresh pings
	activeProjects := make([]Project, len(projects))
	copy(activeProjects, projects)

	for i := range activeProjects {
		wg.Add(1)
		go pingService(&activeProjects[i], &wg)
	}

	wg.Wait()
	c.JSON(http.StatusOK, activeProjects)
}

// ... Keep your CORSMiddleware and main() from previous step ...