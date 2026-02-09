# System Architecture - Heartbeat V1

## 1. High-Level Design
The Heartbeat Management Hub follows a **Service-Oriented Architecture (SOA)**. It separates the concerns of data visualization, API orchestration, and background monitoring into three distinct layers.

```mermaid
graph TD
    User((User)) -->|HTTPS| React[React Frontend]
    React -->|REST API| GoAPI[Go Backend API]
    GoAPI -->|Query| Dynamo[AWS DynamoDB]
    Python[Python Heartbeat Worker] -->|Update| Dynamo
    Python -->|Ping| Projects[10+ External Projects]
