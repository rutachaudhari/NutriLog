package com.nutrilog.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public class Profile {

    private Long id;
    private String name;

    @JsonProperty("created_at")
    private String createdAt;

    private Integer age;
    private String gender;

    @JsonProperty("height_cm")
    private Double heightCm;

    @JsonProperty("current_weight_kg")
    private Double currentWeightKg;

    @JsonProperty("target_weight_kg")
    private Double targetWeightKg;

    @JsonProperty("activity_level")
    private String activityLevel;

    @JsonProperty("weekly_rate_kg")
    private Double weeklyRateKg;

    @JsonProperty("recommended_daily_calories")
    private Double recommendedDailyCalories;

    @JsonProperty("weeks_to_target")
    private Double weeksToTarget;

    public Profile() {}

    // Getters and setters

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public Double getHeightCm() { return heightCm; }
    public void setHeightCm(Double heightCm) { this.heightCm = heightCm; }

    public Double getCurrentWeightKg() { return currentWeightKg; }
    public void setCurrentWeightKg(Double currentWeightKg) { this.currentWeightKg = currentWeightKg; }

    public Double getTargetWeightKg() { return targetWeightKg; }
    public void setTargetWeightKg(Double targetWeightKg) { this.targetWeightKg = targetWeightKg; }

    public String getActivityLevel() { return activityLevel; }
    public void setActivityLevel(String activityLevel) { this.activityLevel = activityLevel; }

    public Double getWeeklyRateKg() { return weeklyRateKg; }
    public void setWeeklyRateKg(Double weeklyRateKg) { this.weeklyRateKg = weeklyRateKg; }

    public Double getRecommendedDailyCalories() { return recommendedDailyCalories; }
    public void setRecommendedDailyCalories(Double recommendedDailyCalories) {
        this.recommendedDailyCalories = recommendedDailyCalories;
    }

    public Double getWeeksToTarget() { return weeksToTarget; }
    public void setWeeksToTarget(Double weeksToTarget) { this.weeksToTarget = weeksToTarget; }
}
