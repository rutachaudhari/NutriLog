package com.nutrilog.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutrilog.model.ParsedFoodItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Service
public class LlmParserService {

    private static final Logger log = LoggerFactory.getLogger(LlmParserService.class);

    /**
     * Step 1: Understand the meal and decompose it into concrete ingredients with gram weights.
     * The model focuses purely on food identification — no nutrition math.
     */
    private static final String DECOMPOSITION_PROMPT =
            "You are a food expert with deep knowledge of cuisines worldwide, including regional and traditional dishes.\n" +
            "The user will describe a meal they ate. Your sole task is to identify EVERY food component it contains.\n" +
            "\n" +
            "Rules:\n" +
            "- If it is a named dish (e.g. 'pljeskavica', 'pad thai', 'lasagne bolognese'), break it down into its actual ingredients with realistic proportions.\n" +
            "- If the user gives a weight for the whole dish, distribute that weight across ingredients proportionally.\n" +
            "- If no weight is given, use a typical single-serving portion.\n" +
            "- Include everything: proteins, carbs, vegetables, sauces, toppings, drinks, condiments.\n" +
            "- Use specific names (e.g. 'white rice cooked' not 'rice'; 'whole milk' not 'milk').\n" +
            "\n" +
            "Return ONLY a JSON array — no explanation, no markdown. Each element:\n" +
            "  {\"name\": \"<specific food name>\", \"quantity_g\": <number>}";

    /**
     * Step 2: Given an exact list of ingredients with gram weights, estimate nutrition.
     * The model focuses purely on nutrition lookup — no food interpretation.
     */
    private static final String NUTRITION_PROMPT =
            "You are a professional nutritionist with expert knowledge of food composition databases.\n" +
            "You will receive a JSON list of food items with gram weights already specified.\n" +
            "For EACH item, provide accurate nutrition values scaled to the exact gram weight given.\n" +
            "\n" +
            "Rules:\n" +
            "- Base your estimates on standard food composition data (USDA or equivalent).\n" +
            "- All values must be scaled to the provided quantity_g — do NOT assume 100g.\n" +
            "- Never return null; use 0 only if a nutrient is genuinely absent (e.g. fiber in meat).\n" +
            "- Keep the same name and quantity_g from input — do not change them.\n" +
            "\n" +
            "Return ONLY a JSON array — no explanation, no markdown. Each element must have exactly:\n" +
            "  {\"name\": string, \"quantity_g\": number, \"calories\": number, \"protein_g\": number, \"fat_g\": number, \"fiber_g\": number}";

    private final WebClient llmWebClient;
    private final ObjectMapper objectMapper;

    @Value("${llm.provider:groq}")
    private String llmProvider;

    @Value("${groq.api.key:}")
    private String groqApiKey;

    @Value("${openai.api.key:}")
    private String openaiApiKey;

    @Value("${groq.model:llama3-8b-8192}")
    private String groqModel;

    @Value("${openai.model:gpt-4o-mini}")
    private String openaiModel;

    public LlmParserService(
            @Qualifier("groqWebClient") WebClient groqWebClient,
            @Qualifier("openaiWebClient") WebClient openaiWebClient,
            ObjectMapper objectMapper,
            @Value("${llm.provider:groq}") String llmProvider) {
        // Select client based on provider at construction time
        // We re-inject llmProvider here to use it during bean creation
        this.llmWebClient = "openai".equalsIgnoreCase(llmProvider) ? openaiWebClient : groqWebClient;
        this.objectMapper = objectMapper;
    }

    /**
     * Two-step parsing:
     *  1. Decompose the user's meal description into concrete ingredients + gram weights.
     *  2. Estimate nutrition for each identified ingredient.
     */
    public List<ParsedFoodItem> parse(String userMessage) {
        // Step 1: decompose
        String ingredientsJson = callLlm(DECOMPOSITION_PROMPT, userMessage);
        if (ingredientsJson == null) {
            log.warn("Decomposition step returned nothing for: {}", userMessage);
            return List.of();
        }
        log.debug("Decomposition result: {}", ingredientsJson);

        // Step 2: estimate nutrition using the decomposed ingredients as input
        String nutritionJson = callLlm(NUTRITION_PROMPT, "Estimate nutrition for these food items:\n" + ingredientsJson);
        if (nutritionJson == null) {
            log.warn("Nutrition estimation step returned nothing");
            return List.of();
        }
        log.debug("Nutrition result: {}", nutritionJson);

        try {
            return objectMapper.readValue(nutritionJson, new TypeReference<List<ParsedFoodItem>>() {});
        } catch (Exception e) {
            log.warn("Failed to deserialize nutrition response: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Calls the LLM with the given system prompt and user message.
     * Returns the stripped text content, or null on any failure.
     */
    private String callLlm(String systemPrompt, String userMessage) {
        String apiKey = "openai".equalsIgnoreCase(llmProvider) ? openaiApiKey : groqApiKey;
        String model = "openai".equalsIgnoreCase(llmProvider) ? openaiModel : groqModel;

        if (apiKey == null || apiKey.isBlank()) {
            log.warn("LLM API key is not configured for provider '{}'; skipping LLM call", llmProvider);
            return null;
        }

        try {
            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", userMessage)
                    )
            );

            String rawResponse = llmWebClient.post()
                    .uri("/chat/completions")
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (rawResponse == null || rawResponse.isBlank()) {
                log.warn("LLM returned empty response");
                return null;
            }

            var responseNode = objectMapper.readTree(rawResponse);
            String content = responseNode
                    .path("choices").path(0)
                    .path("message").path("content")
                    .asText("");

            if (content.isBlank()) {
                log.warn("LLM response had no content: {}", rawResponse);
                return null;
            }

            // Strip markdown code fences
            content = content.replaceAll("(?s)^```(?:json)?\\s*", "")
                             .replaceAll("(?s)```\\s*$", "")
                             .strip();

            return content;

        } catch (Exception e) {
            log.warn("LLM call failed: {}", e.getMessage());
            return null;
        }
    }
}
