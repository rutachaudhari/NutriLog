package com.nutrilog.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CalorieGoalServiceTest {

    private CalorieGoalService service;

    @BeforeEach
    void setUp() {
        service = new CalorieGoalService();
    }

    // --- computeRecommendedCalories ---

    @Test
    void returnsNull_whenAnyInputIsNull() {
        assertNull(service.computeRecommendedCalories(null, 170.0, 30, "male", "sedentary", 0.5, 75.0));
        assertNull(service.computeRecommendedCalories(80.0, null, 30, "male", "sedentary", 0.5, 75.0));
        assertNull(service.computeRecommendedCalories(80.0, 170.0, null, "male", "sedentary", 0.5, 75.0));
    }

    @Test
    void throwsIllegalArgument_whenActivityLevelUnknown() {
        assertThrows(IllegalArgumentException.class, () ->
                service.computeRecommendedCalories(80.0, 170.0, 30, "male", "turbo_active", 0.5, 75.0));
    }

    @Test
    void computesBmrCorrectly_forMale() {
        // BMR = (10 * 80) + (6.25 * 170) - (5 * 30) + 5 = 800 + 1062.5 - 150 + 5 = 1717.5
        // TDEE = 1717.5 * 1.2 (sedentary) = 2061.0
        // weight == target → recommended = TDEE
        Double result = service.computeRecommendedCalories(80.0, 170.0, 30, "male", "sedentary", 0.5, 80.0);
        assertNotNull(result);
        assertEquals(2061.0, result, 0.01);
    }

    @Test
    void computesBmrCorrectly_forFemale() {
        // BMR = (10 * 65) + (6.25 * 165) - (5 * 25) - 161 = 650 + 1031.25 - 125 - 161 = 1395.25
        // TDEE = 1395.25 * 1.375 (lightly_active) = 1918.47
        // weight == target → recommended = TDEE
        Double result = service.computeRecommendedCalories(65.0, 165.0, 25, "female", "lightly_active", 0.5, 65.0);
        assertNotNull(result);
        assertEquals(1918.47, result, 0.01);
    }

    @Test
    void subtractsDelta_whenTargetWeightIsLower() {
        // same male profile, target 75 (loss) → recommended = TDEE - (0.5 * 7700 / 7)
        Double tdee = service.computeRecommendedCalories(80.0, 170.0, 30, "male", "sedentary", 0.5, 80.0); // baseline
        Double loss  = service.computeRecommendedCalories(80.0, 170.0, 30, "male", "sedentary", 0.5, 75.0);
        assertNotNull(tdee);
        assertNotNull(loss);
        assertEquals(tdee - (0.5 * 7700.0 / 7), loss, 0.01);
    }

    @Test
    void addsDelta_whenTargetWeightIsHigher() {
        Double tdee = service.computeRecommendedCalories(70.0, 170.0, 30, "male", "sedentary", 0.5, 70.0);
        Double gain  = service.computeRecommendedCalories(70.0, 170.0, 30, "male", "sedentary", 0.5, 75.0);
        assertNotNull(tdee);
        assertNotNull(gain);
        assertEquals(tdee + (0.5 * 7700.0 / 7), gain, 0.01);
    }

    // --- computeWeeksToTarget ---

    @Test
    void weeksToTarget_returnsNull_whenInputsNull() {
        assertNull(service.computeWeeksToTarget(null, 75.0, 0.5));
        assertNull(service.computeWeeksToTarget(80.0, null, 0.5));
        assertNull(service.computeWeeksToTarget(80.0, 75.0, null));
    }

    @Test
    void weeksToTarget_returnsNull_whenWeightMatchesTarget() {
        assertNull(service.computeWeeksToTarget(75.0, 75.0, 0.5));
    }

    @Test
    void weeksToTarget_returnsNull_whenRateIsZero() {
        assertNull(service.computeWeeksToTarget(80.0, 75.0, 0.0));
    }

    @Test
    void weeksToTarget_calculatesCorrectly() {
        // |80 - 75| / 0.5 = 10 weeks
        assertEquals(10.0, service.computeWeeksToTarget(80.0, 75.0, 0.5), 0.01);
    }

    @Test
    void weeksToTarget_usesAbsoluteValue_forWeightGain() {
        // gaining: |70 - 75| / 0.5 = 10 weeks
        assertEquals(10.0, service.computeWeeksToTarget(70.0, 75.0, 0.5), 0.01);
    }
}
