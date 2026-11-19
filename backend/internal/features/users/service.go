package users

import (
	"context"
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

var ErrHashPassword = errors.New("failed to hash password")

// Service centralizes password hashing and account creation for signup and administration.
type Service struct{ Repo *Repository }

func NewService(repo *Repository) *Service { return &Service{Repo: repo} }

func (s *Service) Create(ctx context.Context, input AccountInput, roleID int) (int, error) {
	var roleIDs []int
	if roleID > 0 {
		roleIDs = []int{roleID}
	}
	return s.CreateWithRoles(ctx, input, roleIDs)
}

func (s *Service) CreateWithRoles(ctx context.Context, input AccountInput, roleIDs []int) (int, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", ErrHashPassword, err)
	}
	return s.Repo.CreateUserWithRoles(ctx, input, string(hash), roleIDs)
}
