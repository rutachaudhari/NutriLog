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

    private static final String SYSTEM_PROMPT =
            "You are a nutrition parser. The user will describe a meal in plain English.\n" +
            "Return ONLY a JSON array — no explanation, no markdown, just raw JSON.\n" +
            "Each element must have exactly these fields:\n" +
            "  name (string): the food item name\n" +
            "  quantity_g (number): estimated weight in grams\n" +
            "  calories (number): estimated kcal\n" +
            "  protein_g (number): estimated protein in grams\n" +
            "  fat_g (number): estimated fat in grams\n" +
            "  fiber_g (number): estimated dietary fiber in grams\n" +
            "If you cannot estimate a field, use 0. Never return null for any field.";

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

    public List<ParsedFoodItem> parse(String userMessage) {
        return callLlmApi(userMessage);
    }

    private List<ParsedFoodItem> callLlmApi(String userMessage) {
        String apiKey = "openai".equalsIgnoreCase(llmProvider) ? openaiApiKey : groqApiKey;
        String model = "openai".equalsIgnoreCase(llmProvider) ? openaiModel : groqModel;

        if (apiKey == null || apiKey.isBlank()) {
            log.warn("LLM API key is not configured for provider '{}'; skipping LLM parse", llmProvider);
            return List.of();
        }

        try {
            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", SYSTEM_PROMPT),
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
                return List.of();
            }

            // Extract choices[0].message.content
            var responseNode = objectMapper.readTree(rawResponse);
            String content = responseNode
                    .path("choices").path(0)
                    .path("message").path("content")
                    .asText("");

            if (content.isBlank()) {
                log.warn("LLM response had no content: {}", rawResponse);
                return List.of();
            }

            // Strip markdown code fences
            content = content.replaceAll("(?s)^```(?:json)?\\s*", "")
                             .replaceAll("(?s)```\\s*$", "")
                             .strip();

            return objectMapper.readValue(content, new TypeReference<List<ParsedFoodItem>>() {});

        } catch (Exception e) {
            log.warn("Failed to parse LLM response: {}", e.getMessage());
            return List.of();
        }
    }
}
