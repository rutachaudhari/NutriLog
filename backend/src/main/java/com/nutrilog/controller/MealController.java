package com.nutrilog.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.nutrilog.exception.MealNotFoundException;
import com.nutrilog.exception.ProfileNotFoundException;
import com.nutrilog.model.FoodSource;
import com.nutrilog.model.Meal;
import com.nutrilog.model.ParseRequest;
import com.nutrilog.model.ParseResponse;
import com.nutrilog.model.ParsedFoodItem;
import com.nutrilog.repository.MealRepository;
import com.nutrilog.repository.ProfileRepository;
import com.nutrilog.service.MealParserOrchestrator;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
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

    /**
     * Manual nutrition entry — user provides exact values; no LLM or external API call.
     * Returns the same ParseResponse shape so the frontend confirm flow is identical.
     */
    @PostMapping("/meals/parse/manual")
    public ParseResponse parseMealManual(@RequestBody @Valid ManualParseRequest request) {
        profileRepository.findById(request.profileId())
                .orElseThrow(() -> new ProfileNotFoundException(request.profileId()));

        List<ParsedFoodItem> items = request.items().stream().map(entry -> {
            ParsedFoodItem item = new ParsedFoodItem();
            item.setName(entry.name());
            item.setQuantityG(entry.quantityG() != null ? entry.quantityG() : 100.0);
            item.setCalories(entry.calories() != null ? entry.calories() : 0.0);
            item.setProteinG(entry.proteinG() != null ? entry.proteinG() : 0.0);
            item.setFatG(entry.fatG() != null ? entry.fatG() : 0.0);
            item.setFiberG(entry.fiberG() != null ? entry.fiberG() : 0.0);
            item.setSource(FoodSource.MANUAL);
            item.setNotFound(false);
            return item;
        }).toList();

        Map<String, Double> totals = new HashMap<>();
        totals.put("calories",   round(items.stream().mapToDouble(i -> i.getCalories()  != null ? i.getCalories()  : 0).sum()));
        totals.put("protein_g",  round(items.stream().mapToDouble(i -> i.getProteinG()  != null ? i.getProteinG()  : 0).sum()));
        totals.put("fat_g",      round(items.stream().mapToDouble(i -> i.getFatG()      != null ? i.getFatG()      : 0).sum()));
        totals.put("fiber_g",    round(items.stream().mapToDouble(i -> i.getFiberG()    != null ? i.getFiberG()    : 0).sum()));

        return new ParseResponse(items, totals);
    }

    private static double round(double v) {
        return Math.round(v * 10.0) / 10.0;
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
        if (request.loggedAt() != null && !request.loggedAt().isBlank()) {
            meal.setLoggedAt(request.loggedAt());
        }

        return mealRepository.save(meal);
    }

    @GetMapping("/meals")
    public List<Meal> getMeals(
            @RequestParam("profile_id") Long profileId,
            @RequestParam(value = "date", required = false) String date,
            @RequestParam(value = "start_date", required = false) String startDate,
            @RequestParam(value = "end_date", required = false) String endDate) {
        if (startDate != null && endDate != null) {
            return mealRepository.findByProfileIdAndDateRange(profileId, startDate, endDate);
        }
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

    // --- Request DTOs ---

    public record ManualParseRequest(
            @NotNull
            @JsonProperty("profile_id")
            Long profileId,

            @NotNull
            List<ManualFoodItem> items
    ) {}

    public record ManualFoodItem(
            @NotBlank
            String name,

            @JsonProperty("quantity_g")
            Double quantityG,

            Double calories,

            @JsonProperty("protein_g")
            Double proteinG,

            @JsonProperty("fat_g")
            Double fatG,

            @JsonProperty("fiber_g")
            Double fiberG
    ) {}

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
            Double fiberG,

            @JsonProperty("logged_at")
            String loggedAt
    ) {}
}
