package com.nutrilog.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutrilog.model.FoodSource;
import com.nutrilog.model.ParsedFoodItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Optional;

@Service
public class UsdaLookupService {

    private static final Logger log = LoggerFactory.getLogger(UsdaLookupService.class);

    // Nutrient number (string) and nutrientId (int) mappings
    private static final String KCAL_NUMBER   = "208";  private static final int KCAL_ID   = 1008;
    private static final String PROTEIN_NUMBER = "203"; private static final int PROTEIN_ID = 1003;
    private static final String FAT_NUMBER    = "204";  private static final int FAT_ID    = 1004;
    private static final String FIBER_NUMBER  = "291";  private static final int FIBER_ID  = 1079;

    private final WebClient usdaWebClient;
    private final ObjectMapper objectMapper;

    @Value("${usda.api.key:}")
    private String usdaApiKey;

    public UsdaLookupService(
            @Qualifier("usdaWebClient") WebClient usdaWebClient,
            ObjectMapper objectMapper) {
        this.usdaWebClient = usdaWebClient;
        this.objectMapper = objectMapper;
    }

    public Mono<Optional<ParsedFoodItem>> lookupByName(String name, Double quantityG) {
        if (usdaApiKey == null || usdaApiKey.isBlank()) {
            log.warn("USDA_API_KEY is not configured; skipping USDA lookup for '{}'", name);
            return Mono.just(Optional.empty());
        }

        return usdaWebClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/fdc/v1/foods/search")
                        .queryParam("query", name)
                        .queryParam("api_key", usdaApiKey)
                        .queryParam("pageSize", 1)
                        .build())
                .retrieve()
                .bodyToMono(String.class)
                .map(body -> parseResponse(body, name, quantityG))
                .onErrorResume(e -> {
                    log.warn("USDA lookup failed for '{}': {}", name, e.getMessage());
                    return Mono.just(Optional.empty());
                });
    }

    private Optional<ParsedFoodItem> parseResponse(String body, String name, Double quantityG) {
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode foods = root.path("foods");
            if (!foods.isArray() || foods.isEmpty()) {
                return Optional.empty();
            }

            JsonNode food = foods.get(0);
            JsonNode nutrients = food.path("foodNutrients");

            double calories = 0, protein = 0, fat = 0, fiber = 0;

            for (JsonNode nutrient : nutrients) {
                String number = nutrient.path("nutrientNumber").asText("");
                int nutrientId = nutrient.path("nutrientId").asInt(-1);
                double value = nutrient.path("value").asDouble(0);

                if (number.equals(KCAL_NUMBER) || nutrientId == KCAL_ID) {
                    calories = value;
                } else if (number.equals(PROTEIN_NUMBER) || nutrientId == PROTEIN_ID) {
                    protein = value;
                } else if (number.equals(FAT_NUMBER) || nutrientId == FAT_ID) {
                    fat = value;
                } else if (number.equals(FIBER_NUMBER) || nutrientId == FIBER_ID) {
                    fiber = value;
                }
            }

            double scale = (quantityG != null ? quantityG : 100.0) / 100.0;

            ParsedFoodItem item = new ParsedFoodItem();
            item.setName(food.path("description").asText(name));
            item.setQuantityG(quantityG != null ? quantityG : 100.0);
            item.setCalories(Math.round(calories * scale * 10.0) / 10.0);
            item.setProteinG(Math.round(protein * scale * 10.0) / 10.0);
            item.setFatG(Math.round(fat * scale * 10.0) / 10.0);
            item.setFiberG(Math.round(fiber * scale * 10.0) / 10.0);
            item.setSource(FoodSource.USDA);
            item.setNotFound(false);

            return Optional.of(item);

        } catch (Exception e) {
            log.warn("Failed to parse USDA response for '{}': {}", name, e.getMessage());
            return Optional.empty();
        }
    }
}
