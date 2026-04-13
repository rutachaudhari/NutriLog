package com.nutrilog.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.nutrilog.exception.MealNotFoundException;
import com.nutrilog.exception.ProfileNotFoundException;
import com.nutrilog.model.Meal;
import com.nutrilog.model.ParseRequest;
import com.nutrilog.model.ParseResponse;
import com.nutrilog.repository.MealRepository;
import com.nutrilog.repository.ProfileRepository;
import com.nutrilog.service.MealParserOrchestrator;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class MealController {

    private final MealParserOrchestrator orchestrator;
    private final MealRepository mealRepository;
    private final ProfileRepository profileRepository;

    public MealController(
            MealParserOrchestrator orchestrator,
            MealRepository mealRepository,
            ProfileRepository profileRepository) {
        this.orchestrator = orchestrator;
        this.mealRepository = mealRepository;
        this.profileRepository = profileRepository;
    }

    @PostMapping("/meals/parse")
    public ParseResponse parseMeal(@RequestBody @Valid ParseRequest request) {
        profileRepository.findById(request.profileId())
                .orElseThrow(() -> new ProfileNotFoundException(request.profileId()));

        return orchestrator.parse(request.description()).block();
    }

    @PostMapping("/meals")
    public Meal saveMeal(@RequestBody @Valid MealSaveRequest request) {
        profileRepository.findById(request.profileId())
                .orElseThrow(() -> new ProfileNotFoundException(request.profileId()));

        Meal meal = new Meal();
        meal.setProfileId(request.profileId());
        meal.setDescription(request.description());
        meal.setCalories(request.calories());
        meal.setProteinG(request.proteinG());
        meal.setFatG(request.fatG());
        meal.setFiberG(request.fiberG());
        // items_json arrives as a JSON array literal string from Jackson
        meal.setItemsJsonRaw(request.itemsJson());

        return mealRepository.save(meal);
    }

    @GetMapping("/meals")
    public List<Meal> getMeals(
            @RequestParam("profile_id") Long profileId,
            @RequestParam("date") String date) {
        return mealRepository.findByProfileIdAndDate(profileId, date);
    }

    @DeleteMapping("/meals/{id}")
    public ResponseEntity<Map<String, Object>> deleteMeal(@PathVariable Long id) {
        int affected = mealRepository.deleteById(id);
        if (affected == 0) {
            throw new MealNotFoundException(id);
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // --- Request DTO ---

    public record MealSaveRequest(
            @NotNull
            @JsonProperty("profile_id")
            Long profileId,

            @NotBlank
            String description,

            @JsonProperty("items_json")
            String itemsJson,

            Double calories,

            @JsonProperty("protein_g")
            Double proteinG,

            @JsonProperty("fat_g")
            Double fatG,

            @JsonProperty("fiber_g")
            Double fiberG
    ) {}
}
