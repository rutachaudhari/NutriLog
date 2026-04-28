package com.nutrilog.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.nutrilog.exception.ProfileNotFoundException;
import com.nutrilog.model.Profile;
import com.nutrilog.repository.ProfileRepository;
import com.nutrilog.service.CalorieGoalService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/profiles")
public class ProfileController {

    private final ProfileRepository profileRepository;
    private final CalorieGoalService calorieGoalService;

    public ProfileController(ProfileRepository profileRepository, CalorieGoalService calorieGoalService) {
        this.profileRepository = profileRepository;
        this.calorieGoalService = calorieGoalService;
    }

    @GetMapping
    public List<Profile> getAll() {
        List<Profile> profiles = profileRepository.findAll();
        for (Profile p : profiles) {
            p.setWeeksToTarget(calorieGoalService.computeWeeksToTarget(
                    p.getCurrentWeightKg(), p.getTargetWeightKg(), p.getWeeklyRateKg()));
        }
        return profiles;
    }

    @GetMapping("/{id}")
    public Profile getById(@PathVariable Long id) {
        Profile p = profileRepository.findById(id)
                .orElseThrow(() -> new ProfileNotFoundException(id));
        p.setWeeksToTarget(calorieGoalService.computeWeeksToTarget(
                p.getCurrentWeightKg(), p.getTargetWeightKg(), p.getWeeklyRateKg()));
        return p;
    }

    @PostMapping
    public Profile create(@RequestBody @Valid ProfileRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "name is required");
        }
        Profile profile = new Profile();
        profile.setName(request.name());
        profile.setAge(request.age());
        profile.setGender(request.gender());
        profile.setHeightCm(request.heightCm());
        profile.setCurrentWeightKg(request.currentWeightKg());
        profile.setTargetWeightKg(request.targetWeightKg());
        profile.setActivityLevel(request.activityLevel());
        profile.setWeeklyRateKg(request.weeklyRateKg());

        Double calories = calorieGoalService.computeRecommendedCalories(
                request.currentWeightKg(),
                request.heightCm(),
                request.age(),
                request.gender(),
                request.activityLevel(),
                request.weeklyRateKg(),
                request.targetWeightKg()
        );
        profile.setRecommendedDailyCalories(calories);

        Profile saved = profileRepository.save(profile);
        saved.setWeeksToTarget(calorieGoalService.computeWeeksToTarget(
                saved.getCurrentWeightKg(), saved.getTargetWeightKg(), saved.getWeeklyRateKg()));
        return saved;
    }

    @PutMapping("/{id}")
    public Profile update(@PathVariable Long id, @RequestBody ProfileRequest request) {
        Profile existing = profileRepository.findById(id)
                .orElseThrow(() -> new ProfileNotFoundException(id));

        // Update name
        if (request.name() != null && !request.name().isBlank()) {
            existing.setName(request.name());
        }

        boolean hasAnyHealthField = request.age() != null
                || request.gender() != null
                || request.heightCm() != null
                || request.currentWeightKg() != null
                || request.targetWeightKg() != null
                || request.activityLevel() != null
                || request.weeklyRateKg() != null;

        if (hasAnyHealthField) {
            // Use request value if provided, else keep existing
            Integer age = request.age() != null ? request.age() : existing.getAge();
            String gender = request.gender() != null ? request.gender() : existing.getGender();
            Double heightCm = request.heightCm() != null ? request.heightCm() : existing.getHeightCm();
            Double currentWeightKg = request.currentWeightKg() != null ? request.currentWeightKg() : existing.getCurrentWeightKg();
            Double targetWeightKg = request.targetWeightKg() != null ? request.targetWeightKg() : existing.getTargetWeightKg();
            String activityLevel = request.activityLevel() != null ? request.activityLevel() : existing.getActivityLevel();
            Double weeklyRateKg = request.weeklyRateKg() != null ? request.weeklyRateKg() : existing.getWeeklyRateKg();

            existing.setAge(age);
            existing.setGender(gender);
            existing.setHeightCm(heightCm);
            existing.setCurrentWeightKg(currentWeightKg);
            existing.setTargetWeightKg(targetWeightKg);
            existing.setActivityLevel(activityLevel);
            existing.setWeeklyRateKg(weeklyRateKg);

            Double calories = calorieGoalService.computeRecommendedCalories(
                    currentWeightKg, heightCm, age, gender, activityLevel, weeklyRateKg, targetWeightKg);
            existing.setRecommendedDailyCalories(calories);
        }

        Profile updated = profileRepository.update(existing);
        updated.setWeeksToTarget(calorieGoalService.computeWeeksToTarget(
                updated.getCurrentWeightKg(), updated.getTargetWeightKg(), updated.getWeeklyRateKg()));
        return updated;
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable Long id) {
        int affected = profileRepository.deleteById(id);
        if (affected == 0) {
            throw new ProfileNotFoundException(id);
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // --- Request DTO ---

    public record ProfileRequest(
            String name,

            Integer age,
            String gender,

            @JsonProperty("height_cm")
            Double heightCm,

            @JsonProperty("current_weight_kg")
            Double currentWeightKg,

            @JsonProperty("target_weight_kg")
            Double targetWeightKg,

            @JsonProperty("activity_level")
            String activityLevel,

            @JsonProperty("weekly_rate_kg")
            Double weeklyRateKg
    ) {}
}
