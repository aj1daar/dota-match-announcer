package com.github.aj1daar.dotaannouncer.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class PandaScoreConfig {

  @Value("${pandascore.token}")
  private String apiToken;

  @Value("${pandascore.base-url}")
  private String baseUrl;

  @Bean
  public RestClient pandaScoreClient(RestClient.Builder builder) {
    return builder
        .baseUrl(baseUrl)
        .defaultHeader("Authorization", "Bearer " + apiToken)
        .defaultHeader("Accept", "application/json")
        .build();
  }
}