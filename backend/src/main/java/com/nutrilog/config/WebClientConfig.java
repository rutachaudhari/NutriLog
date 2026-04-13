package com.nutrilog.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;

import java.time.Duration;

@Configuration
public class WebClientConfig {

    @Value("${groq.api.base-url}")
    private String groqBaseUrl;

    @Value("${openai.api.base-url}")
    private String openaiBaseUrl;

    @Bean("groqWebClient")
    public WebClient groqWebClient() {
        HttpClient httpClient = HttpClient.create().responseTimeout(Duration.ofSeconds(4));
        return WebClient.builder()
                .baseUrl(groqBaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    @Bean("openaiWebClient")
    public WebClient openaiWebClient() {
        HttpClient httpClient = HttpClient.create().responseTimeout(Duration.ofSeconds(4));
        return WebClient.builder()
                .baseUrl(openaiBaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    @Bean("usdaWebClient")
    public WebClient usdaWebClient() {
        HttpClient httpClient = HttpClient.create().responseTimeout(Duration.ofSeconds(4));
        return WebClient.builder()
                .baseUrl("https://api.nal.usda.gov")
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    @Bean("openFoodFactsWebClient")
    public WebClient openFoodFactsWebClient() {
        HttpClient httpClient = HttpClient.create().responseTimeout(Duration.ofSeconds(4));
        return WebClient.builder()
                .baseUrl("https://world.openfoodfacts.org")
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }
}
