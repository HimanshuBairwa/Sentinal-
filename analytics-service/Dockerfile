FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o main ./main.go

FROM alpine:3.19
RUN apk add --no-cache wget ca-certificates
WORKDIR /app
COPY --from=builder /app/main .
EXPOSE 8083
CMD ["./main"]
