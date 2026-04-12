package com.nutrilog.exception;

public class MealNotFoundException extends RuntimeException {
    public MealNotFoundException(Long id) {
        super("Meal not found: " + id);
    }
    public MealNotFoundException(String message) {
        super(message);
    }
}
