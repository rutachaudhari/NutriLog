package com.nutrilog.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class ParsedFoodItem {

    private String name;

    @JsonProperty("quantity_g")
    private Double quantityG;

    private String unit;
    private Double calories;

    @JsonProperty("protein_g")
    private Double proteinG;

    @JsonProperty("fat_g")
    private Double fatG;

    @JsonProperty("fiber_g")
    private Double fiberG;

    private FoodSource source;

    @JsonProperty("not_found")
    private Boolean notFound;

    public ParsedFoodItem() {}

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Double getQuantityG() { return quantityG; }
    public void setQuantityG(Double quantityG) { this.quantityG = quantityG; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public Double getCalories() { return calories; }
    public void setCalories(Double calories) { this.calories = calories; }

    public Double getProteinG() { return proteinG; }
    public void setProteinG(Double proteinG) { this.proteinG = proteinG; }

    public Double getFatG() { return fatG; }
    public void setFatG(Double fatG) { this.fatG = fatG; }

    public Double getFiberG() { return fiberG; }
    public void setFiberG(Double fiberG) { this.fiberG = fiberG; }

    public FoodSource getSource() { return source; }
    public void setSource(FoodSource source) { this.source = source; }

    public Boolean getNotFound() { return notFound; }
    public void setNotFound(Boolean notFound) { this.notFound = notFound; }
}
