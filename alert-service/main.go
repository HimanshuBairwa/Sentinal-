package main
import "net/http"
func main() {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	http.ListenAndServe(":8084", nil)
}
