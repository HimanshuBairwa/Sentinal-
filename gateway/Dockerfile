FROM golang:1.22-alpine AS builder
RUN apk add --no-cache wget git
WORKDIR /app
COPY . .
RUN go mod download
RUN CGO_ENABLED=0 go build -o main ./cmd/main.go

FROM alpine:3.20
RUN apk add --no-cache wget ca-certificates
RUN addgroup -S sentinel && adduser -S -G sentinel sentinel
WORKDIR /app
COPY --from=builder /app/main .
USER sentinel
EXPOSE 8080 9100
CMD ["./main"]
