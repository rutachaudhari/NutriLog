package com.nutrilog.exception;

public class ProfileNotFoundException extends RuntimeException {
    public ProfileNotFoundException(Long id) {
        super("Profile not found: " + id);
    }
    public ProfileNotFoundException(String message) {
        super(message);
    }
}
