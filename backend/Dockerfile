FROM golang:1.24-alpine AS build

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/heartbeat-backend .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /bin/heartbeat-backend /usr/local/bin/heartbeat-backend

EXPOSE 8080
CMD ["heartbeat-backend"]

