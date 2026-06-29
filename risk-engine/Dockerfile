FROM python:3.12-alpine
WORKDIR /app
EXPOSE 8082
CMD ["python3", "-c", "import http.server, socketserver; class handler(http.server.BaseHTTPRequestHandler): \n  def do_GET(self): self.send_response(200); self.end_headers()\nserver = socketserver.TCPServer(('', 8082), handler); server.serve_forever()"]
