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
            // LLM failed: fall back to splitting description and looking up each token
            List<String> tokens = Arrays.stream(description.split("(?i)\\s+and\\s+|,|\\s+with\\s+"))
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .collect(Collectors.toList());

            resolvedItems = Flux.fromIterable(tokens)
                    .flatMap(token -> resolveToken(token, 100.0))
                    .collectList();
        } else {
            // LLM returned items: verify each via USDA -> OFF -> llm_estimate/not_found
            resolvedItems = Flux.fromIterable(llmItems)
                    .flatMap(llmItem -> resolveWithFallback(llmItem)
                            .onErrorResume(e -> {
                                log.warn("Error resolving item '{}', falling back to not_found: {}",
                                        llmItem.getName(), e.getMessage());
                                llmItem.setSource(FoodSource.NOT_FOUND);
                                llmItem.setNotFound(true);
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
     * For a plain token (from fallback split): USDA -> OFF -> not_found
     */
    private Mono<ParsedFoodItem> resolveToken(String token, double quantityG) {
        return usdaLookupService.lookupByName(token, quantityG)
                .flatMap(usdaResult -> {
                    if (usdaResult.isPresent()) {
                        return Mono.just(usdaResult.get());
                    }
                    return openFoodFactsService.lookupByName(token, quantityG)
                            .map(offResult -> {
                                if (offResult.isPresent()) {
                                    return offResult.get();
                                }
                                return notFoundItem(token, quantityG);
                            });
                })
                .onErrorResume(e -> {
                    log.warn("Error resolving token '{}': {}", token, e.getMessage());
                    return Mono.just(notFoundItem(token, quantityG));
                });
    }

    /**
     * For an LLM-provided item: USDA -> OFF -> llm_estimate/not_found
     */
    private Mono<ParsedFoodItem> resolveWithFallback(ParsedFoodItem llmItem) {
        String name = llmItem.getName();
        Double quantityG = llmItem.getQuantityG() != null ? llmItem.getQuantityG() : 100.0;

        return usdaLookupService.lookupByName(name, quantityG)
                .flatMap(usdaResult -> {
                    if (usdaResult.isPresent()) {
                        // Preserve name and quantity from LLM, use USDA nutrients
                        ParsedFoodItem item = usdaResult.get();
                        item.setName(llmItem.getName());
                        item.setQuantityG(quantityG);
                        return Mono.just(item);
                    }
                    return openFoodFactsService.lookupByName(name, quantityG)
                            .map(offResult -> {
                                if (offResult.isPresent()) {
                                    ParsedFoodItem item = offResult.get();
                                    item.setName(llmItem.getName());
                                    item.setQuantityG(quantityG);
                                    return item;
                                }
                                // No external source: use LLM estimate or not_found
                                boolean hasEstimates = hasNonZeroNutrients(llmItem);
                                llmItem.setSource(hasEstimates ? FoodSource.LLM_ESTIMATE : FoodSource.NOT_FOUND);
                                llmItem.setNotFound(!hasEstimates);
                                return llmItem;
                            });
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
