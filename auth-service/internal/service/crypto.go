package service

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"os"
)

// LoadOrGenerateRSAKey loads an RSA private key from a PEM file.
// If the file does not exist, it generates a new key pair and saves it.
func LoadOrGenerateRSAKey(filepath string) (*rsa.PrivateKey, error) {
	if _, err := os.Stat(filepath); os.IsNotExist(err) {
		// Generate new key
		privKey, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return nil, err
		}

		// Save to file
		privBytes := x509.MarshalPKCS1PrivateKey(privKey)
		privPEM := pem.EncodeToMemory(&pem.Block{
			Type:  "RSA PRIVATE KEY",
			Bytes: privBytes,
		})

		if err := os.WriteFile(filepath, privPEM, 0600); err != nil {
			return nil, err
		}
		return privKey, nil
	}

	// Read existing key
	privPEM, err := os.ReadFile(filepath)
	if err != nil {
		return nil, err
	}

	block, _ := pem.Decode(privPEM)
	if block == nil || block.Type != "RSA PRIVATE KEY" {
		return nil, errors.New("failed to decode PEM block containing RSA private key")
	}

	privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}

	return privKey, nil
}

// GetPublicKeyPEM returns the public key in PEM format
func GetPublicKeyPEM(pubKey *rsa.PublicKey) ([]byte, error) {
	pubBytes, err := x509.MarshalPKIXPublicKey(pubKey)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubBytes,
	}), nil
}
