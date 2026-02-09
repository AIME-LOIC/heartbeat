package main

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	supabaseUrl = "https://qhpfdabvjcgnlvobullq.supabase.co"
	supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFocGZkYWJ2amNnbmx2b2J1bGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NDEwMjcsImV4cCI6MjA4NjIxNzAyN30.gsOHmu03U0ZM-3uigkcYBgBzYRYR3O-6q-NYJOIai2s" // Use the 'service_role' key for server access
)

type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Language    string `json:"language"`
	Status      string `json:"status"`
	Latency     int64  `json:"latency"`
	LastChecked string `json:"last_checked"`
}

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, apikey, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func pingService(p *Project, wg *sync.WaitGroup) {
	defer wg.Done()
	start := time.Now()
	client := http.Client{Timeout: 5 * time.Second}
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
	r := gin.Default()
	r.Use(CORSMiddleware())

	r.GET("/api/v1/status", func(c *gin.Context) {
		// 1. Fetch project list from Supabase
		client := &http.Client{}
		req, _ := http.NewRequest("GET", supabaseUrl+"/rest/v1/projects?select=*", nil)
		req.Header.Set("apikey", supabaseKey)
		req.Header.Set("Authorization", "Bearer "+supabaseKey)

		resp, err := client.Do(req)
		if err != nil {
			c.JSON(500, gin.H{"error": "Cloud Sync Failed"})
			return
		}
		defer resp.Body.Close()

		var projects []Project
		json.NewDecoder(resp.Body).Decode(&projects)

		// 2. Ping all projects concurrently
		var wg sync.WaitGroup
		for i := range projects {
			wg.Add(1)
			go pingService(&projects[i], &wg)
		}
		wg.Wait()

		c.JSON(200, projects)
	})

	r.Run(":8080")
}
