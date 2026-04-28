package com.nutrilog.service;

import com.nutrilog.model.FoodSource;
import com.nutrilog.model.ParsedFoodItem;
import com.nutrilog.model.ParseResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class MealParserOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(MealParserOrchestrator.class);

    private final LlmParserService llmParserService;
    private final UsdaLookupService usdaLookupService;
    private final OpenFoodFactsService openFoodFactsService;

    public MealParserOrchestrator(
            LlmParserService llmParserService,
            UsdaLookupService usdaLookupService,
            OpenFoodFactsService openFoodFactsService) {
        this.llmParserService = llmParserService;
        this.usdaLookupService = usdaLookupService;
        this.openFoodFactsService = openFoodFactsService;
    }

    public Mono<ParseResponse> parse(String description) {
        List<ParsedFoodItem> llmItems = llmParserService.parse(description);

        Mono<List<ParsedFoodItem>> resolvedItems;

        if (llmItems.isEmpty()) {
            // LLM failed entirely: fall back to splitting description and looking up each token
            List<String> tokens = Arrays.stream(description.split("(?i)\\s+and\\s+|,|\\s+with\\s+"))
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .collect(Collectors.toList());

            resolvedItems = Flux.fromIterable(tokens)
                    .flatMap(token -> resolveToken(token, 100.0))
                    .collectList();
        } else {
            // LLM returned items: use estimates directly when available, only hit external
            // APIs for items where LLM had no nutrient data
            resolvedItems = Flux.fromIterable(llmItems)
                    .flatMap(llmItem -> resolveItem(llmItem)
                            .onErrorResume(e -> {
                                log.warn("Error resolving item '{}', falling back to llm_estimate/not_found: {}",
                                        llmItem.getName(), e.getMessage());
                                boolean hasEstimates = hasNonZeroNutrients(llmItem);
                                llmItem.setSource(hasEstimates ? FoodSource.LLM_ESTIMATE : FoodSource.NOT_FOUND);
                                llmItem.setNotFound(!hasEstimates);
                                return Mono.just(llmItem);
                            }))
                    .collectList();
        }

        return resolvedItems.map(items -> {
            Map<String, Double> totals = sumTotals(items);
            return new ParseResponse(items, totals);
        });
    }

    /**
     * Primary resolution strategy for LLM-provided items:
     * - If LLM already has non-zero nutrients, trust it directly (LLM_ESTIMATE)
     * - Only call external APIs when LLM has no useful data
     */
    private Mono<ParsedFoodItem> resolveItem(ParsedFoodItem llmItem) {
        if (hasNonZeroNutrients(llmItem)) {
            llmItem.setSource(FoodSource.LLM_ESTIMATE);
            llmItem.setNotFound(false);
            if (llmItem.getQuantityG() == null) llmItem.setQuantityG(100.0);
            return Mono.just(llmItem);
        }
        // LLM gave no data: try external sources
        return resolveToken(llmItem.getName(),
                llmItem.getQuantityG() != null ? llmItem.getQuantityG() : 100.0);
    }

    /**
     * For a plain token (no LLM data): USDA -> OFF -> not_found
     */
    private Mono<ParsedFoodItem> resolveToken(String token, double quantityG) {
        return usdaLookupService.lookupByName(token, quantityG)
                .flatMap(usdaResult -> {
                    if (usdaResult.isPresent()) {
                        return Mono.just(usdaResult.get());
                    }
                    return openFoodFactsService.lookupByName(token, quantityG)
                            .map(offResult -> offResult.isPresent() ? offResult.get() : notFoundItem(token, quantityG));
                })
                .onErrorResume(e -> {
                    log.warn("Error resolving token '{}': {}", token, e.getMessage());
                    return Mono.just(notFoundItem(token, quantityG));
                });
    }

    private boolean hasNonZeroNutrients(ParsedFoodItem item) {
        return (item.getCalories() != null && item.getCalories() > 0)
                || (item.getProteinG() != null && item.getProteinG() > 0)
                || (item.getFatG() != null && item.getFatG() > 0)
                || (item.getFiberG() != null && item.getFiberG() > 0);
    }

    private ParsedFoodItem notFoundItem(String name, double quantityG) {
        ParsedFoodItem item = new ParsedFoodItem();
        item.setName(name);
        item.setQuantityG(quantityG);
        item.setCalories(0.0);
        item.setProteinG(0.0);
        item.setFatG(0.0);
        item.setFiberG(0.0);
        item.setSource(FoodSource.NOT_FOUND);
        item.setNotFound(true);
        return item;
    }

    private Map<String, Double> sumTotals(List<ParsedFoodItem> items) {
        double calories = 0, protein = 0, fat = 0, fiber = 0;
        for (ParsedFoodItem item : items) {
            calories += item.getCalories() != null ? item.getCalories() : 0;
            protein  += item.getProteinG() != null ? item.getProteinG() : 0;
            fat      += item.getFatG() != null ? item.getFatG() : 0;
            fiber    += item.getFiberG() != null ? item.getFiberG() : 0;
        }
        Map<String, Double> totals = new HashMap<>();
        totals.put("calories", Math.round(calories * 10.0) / 10.0);
        totals.put("protein_g", Math.round(protein * 10.0) / 10.0);
        totals.put("fat_g", Math.round(fat * 10.0) / 10.0);
        totals.put("fiber_g", Math.round(fiber * 10.0) / 10.0);
        return totals;
    }
}
