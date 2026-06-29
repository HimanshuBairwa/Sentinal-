FROM golang:1.22-alpine
WORKDIR /app
COPY main.go .
RUN go build -o main main.go
EXPOSE 8084
CMD ["./main"]
