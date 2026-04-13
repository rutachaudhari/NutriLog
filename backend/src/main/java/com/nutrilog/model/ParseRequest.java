package com.nutrilog.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ParseRequest(
        @NotNull
        @JsonProperty("profile_id")
        Long profileId,

        @NotBlank
        String description
) {}
