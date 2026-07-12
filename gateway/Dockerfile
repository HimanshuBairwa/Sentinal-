FROM golang:1.22-alpine AS builder
RUN apk add --no-cache wget
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN CGO_ENABLED=0 go build -o main ./cmd/main.go

FROM alpine:3.19
RUN apk add --no-cache wget ca-certificates
WORKDIR /app
COPY --from=builder /app/main .
EXPOSE 8080 9100
CMD ["./main"]
