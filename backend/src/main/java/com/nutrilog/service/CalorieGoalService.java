package com.nutrilog.service;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class CalorieGoalService {

    public Double computeRecommendedCalories(
            Double weightKg,
            Double heightCm,
            Integer age,
            String gender,
            String activityLevel,
            Double weeklyRateKg,
            Double targetWeightKg) {

        if (weightKg == null || heightCm == null || age == null ||
                gender == null || activityLevel == null || weeklyRateKg == null || targetWeightKg == null) {
            return null;
        }

        // BMR (Mifflin-St Jeor)
        double bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
        bmr += gender.equals("male") ? 5 : -161;

        // TDEE
        Map<String, Double> multipliers = Map.of(
                "sedentary", 1.2,
                "lightly_active", 1.375,
                "moderately_active", 1.55,
                "very_active", 1.725
        );
        double tdee = bmr * multipliers.get(activityLevel);

        // Adjust for goal
        double dailyDelta = (weeklyRateKg * 7700) / 7;
        double recommended;
        if (targetWeightKg < weightKg) recommended = tdee - dailyDelta;
        else if (targetWeightKg > weightKg) recommended = tdee + dailyDelta;
        else recommended = tdee;

        return recommended;
    }

    public Double computeWeeksToTarget(Double weightKg, Double targetWeightKg, Double weeklyRateKg) {
        if (weeklyRateKg == null || weightKg == null || targetWeightKg == null) return null;
        if (weeklyRateKg == 0 || Double.compare(weightKg, targetWeightKg) == 0) return null;
        return Math.abs(weightKg - targetWeightKg) / weeklyRateKg;
    }
}
