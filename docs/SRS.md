# Software Requirements Specification (SRS) - Heartbeat V1

## 1. Introduction
### 1.1 Purpose
This document defines the requirements for the Heartbeat Management Hub, a polyglot monitoring tool designed to track the health of 10 distinct projects across various programming languages.

### 1.2 Scope
Heartbeat V1 provides a centralized dashboard (React) powered by a Go API and Python background workers to monitor service uptime, latency, and logs via AWS infrastructure.

---

## 2. Functional Requirements
### 2.1 Heartbeat Engine (Go/Python)
- **F-101**: The system shall execute an HTTP GET request to 10 configured endpoints every 60 seconds.
- **F-102**: The system shall capture the HTTP Status Code, Response Time (ms), and Timestamp for every check.
- **F-103**: The system shall categorize status codes: 
    - 200-299: HEALTHY
    - 400-499: CLIENT_ERROR
    - 500-599: SERVER_DOWN
- **F-104**: Python workers shall utilize a retry mechanism (3 attempts) before confirming a "Down" state.

### 2.2 API Layer (Go)
- **F-201**: The Go backend shall expose a RESTful endpoint `/api/v1/status` for the dashboard.
- **F-202**: The API shall interface with AWS DynamoDB to fetch historical heartbeat data.
- **F-203**: The API shall provide a `/api/v1/logs/{project_id}` endpoint to retrieve execution logs.

### 2.3 Dashboard UI (React)
- **F-301**: The UI shall display 10 "Project Cards" representing the monitored services.
- **F-302**: Each card shall feature a real-time status indicator (Green/Yellow/Red).
- **F-303**: The UI shall display a "Pulse Line" chart showing latency over the last 24 hours.

---

## 3. Non-Functional Requirements
### 3.1 Performance
- **NF-101**: The Go API response time for status checks must be under 200ms.
- **NF-102**: The Python worker must handle 10 concurrent requests without blocking.

### 3.2 Security
- **NF-201**: All external endpoints must be served over HTTPS via AWS CloudFront/ALB.
- **NF-202**: Infrastructure must adhere to the Principle of Least Privilege (PoLP) using AWS IAM roles.

---

## 4. Technology Stack & Constraints
- **Frontend**: React 18+ (TypeScript), Tailwind CSS.
- **Backend**: Go 1.21+ (Gin Framework).
- **Scripts**: Python 3.10+ (Boto3, Requests).
- **Infrastructure**: AWS (DynamoDB, Lambda, App Runner).