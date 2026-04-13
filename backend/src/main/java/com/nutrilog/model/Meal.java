package com.nutrilog.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

public class Meal {

    private Long id;

    @JsonProperty("profile_id")
    private Long profileId;

    @JsonProperty("logged_at")
    private String loggedAt;

    private String description;
    private Double calories;

    @JsonProperty("protein_g")
    private Double proteinG;

    @JsonProperty("fat_g")
    private Double fatG;

    @JsonProperty("fiber_g")
    private Double fiberG;

    @JsonProperty("items_json")
    private JsonNode itemsJson;

    /**
     * Raw string representation of items_json used during INSERT.
     * Not serialized to JSON responses.
     */
    @JsonIgnore
    private String itemsJsonRaw;

    public Meal() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getProfileId() { return profileId; }
    public void setProfileId(Long profileId) { this.profileId = profileId; }

    public String getLoggedAt() { return loggedAt; }
    public void setLoggedAt(String loggedAt) { this.loggedAt = loggedAt; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Double getCalories() { return calories; }
    public void setCalories(Double calories) { this.calories = calories; }

    public Double getProteinG() { return proteinG; }
    public void setProteinG(Double proteinG) { this.proteinG = proteinG; }

    public Double getFatG() { return fatG; }
    public void setFatG(Double fatG) { this.fatG = fatG; }

    public Double getFiberG() { return fiberG; }
    public void setFiberG(Double fiberG) { this.fiberG = fiberG; }

    public JsonNode getItemsJson() { return itemsJson; }
    public void setItemsJson(JsonNode itemsJson) { this.itemsJson = itemsJson; }

    public String getItemsJsonRaw() { return itemsJsonRaw; }
    public void setItemsJsonRaw(String itemsJsonRaw) { this.itemsJsonRaw = itemsJsonRaw; }
}
