package com.nutrilog.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutrilog.model.FoodSource;
import com.nutrilog.model.ParsedFoodItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Optional;

@Service
public class OpenFoodFactsService {

    private static final Logger log = LoggerFactory.getLogger(OpenFoodFactsService.class);

    private final WebClient openFoodFactsWebClient;
    private final ObjectMapper objectMapper;

    public OpenFoodFactsService(
            @Qualifier("openFoodFactsWebClient") WebClient openFoodFactsWebClient,
            ObjectMapper objectMapper) {
        this.openFoodFactsWebClient = openFoodFactsWebClient;
        this.objectMapper = objectMapper;
    }

    public Mono<Optional<ParsedFoodItem>> lookupByName(String name, Double quantityG) {
        return openFoodFactsWebClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/cgi/search.pl")
                        .queryParam("search_terms", name)
                        .queryParam("search_simple", 1)
                        .queryParam("action", "process")
                        .queryParam("json", 1)
                        .queryParam("page_size", 1)
                        .build())
                .retrieve()
                .bodyToMono(String.class)
                .map(body -> parseResponse(body, name, quantityG))
                .onErrorResume(e -> {
                    log.warn("Open Food Facts lookup failed for '{}': {}", name, e.getMessage());
                    return Mono.just(Optional.empty());
                });
    }

    private Optional<ParsedFoodItem> parseResponse(String body, String name, Double quantityG) {
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode products = root.path("products");
            if (!products.isArray() || products.isEmpty()) {
                return Optional.empty();
            }

            JsonNode product = products.get(0);
            JsonNode nutriments = product.path("nutriments");

            double scale = (quantityG != null ? quantityG : 100.0) / 100.0;

            double calories = nutriments.path("energy-kcal_100g").asDouble(0);
            double protein  = nutriments.path("proteins_100g").asDouble(0);
            double fat      = nutriments.path("fat_100g").asDouble(0);
            double fiber    = nutriments.path("fiber_100g").asDouble(0);

            ParsedFoodItem item = new ParsedFoodItem();
            item.setName(product.path("product_name").asText(name));
            item.setQuantityG(quantityG != null ? quantityG : 100.0);
            item.setCalories(Math.round(calories * scale * 10.0) / 10.0);
            item.setProteinG(Math.round(protein * scale * 10.0) / 10.0);
            item.setFatG(Math.round(fat * scale * 10.0) / 10.0);
            item.setFiberG(Math.round(fiber * scale * 10.0) / 10.0);
            item.setSource(FoodSource.OPEN_FOOD_FACTS);
            item.setNotFound(false);

            return Optional.of(item);

        } catch (Exception e) {
            log.warn("Failed to parse Open Food Facts response for '{}': {}", name, e.getMessage());
            return Optional.empty();
        }
    }
}
