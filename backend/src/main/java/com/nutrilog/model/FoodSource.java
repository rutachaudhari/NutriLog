package com.nutrilog.model;

import com.fasterxml.jackson.annotation.JsonValue;

public enum FoodSource {
    USDA("usda"),
    OPEN_FOOD_FACTS("open_food_facts"),
    LLM_ESTIMATE("llm_estimate"),
    MANUAL("manual"),
    NOT_FOUND("not_found");

    private final String value;

    FoodSource(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }
}
