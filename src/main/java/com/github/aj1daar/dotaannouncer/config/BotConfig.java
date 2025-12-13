package com.github.aj1daar.dotaannouncer.config;

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;

@Configuration
public class BotConfig {

  @Bean
  public TelegramBotsApi telegramBotsApi(DotaTelegramBot dotaBot) throws Exception {
    TelegramBotsApi api = new TelegramBotsApi(DefaultBotSession.class);
    api.registerBot(dotaBot);
    return api;
  }
}