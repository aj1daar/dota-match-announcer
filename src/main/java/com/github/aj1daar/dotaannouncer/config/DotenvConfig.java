package com.github.aj1daar.dotaannouncer.config;

import io.github.cdimascio.dotenv.Dotenv;
import org.jetbrains.annotations.NotNull;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

/**
 * Loads environment variables from .env file into Spring's environment
 * Looks for .env file in the project root directory
 */
public class DotenvConfig implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    @Override
    public void initialize(@NotNull ConfigurableApplicationContext applicationContext) {
        try {
            // Load .env from project root
            String envFilePath = new File(".").getAbsolutePath().replace(".", "");

            Dotenv dotenv = Dotenv.configure()
                    .directory(envFilePath.isEmpty() ? "." : envFilePath)
                    .ignoreIfMissing()
                    .load();

            ConfigurableEnvironment environment = applicationContext.getEnvironment();
            Map<String, Object> dotenvProperties = new HashMap<>();

            // Load all .env variables into a map
            dotenv.entries().forEach(entry -> dotenvProperties.put(entry.getKey(), entry.getValue()));

            // Add as a property source with high priority
            if (!dotenvProperties.isEmpty()) {
                environment.getPropertySources()
                        .addFirst(new MapPropertySource("dotenvProperties", dotenvProperties));
                System.out.println("✅ .env file loaded successfully");
            } else {
                System.out.println("⚠️ .env file not found or is empty - using system environment variables");
            }

        } catch (Exception e) {
            // .env file is optional - continue without it
            System.out.println("⚠️ Error loading .env file: " + e.getMessage());
        }
    }
}


