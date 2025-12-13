package com.github.aj1daar.dotaannouncer.controller;

import com.github.aj1daar.dotaannouncer.dto.webhook.PandaScoreEventDto;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import com.github.aj1daar.dotaannouncer.service.MatchMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/webhooks/pandascore")
@RequiredArgsConstructor
@Slf4j
public class PandaScoreWebhookController {

  private final MatchRepository matchRepository;
  private final MatchMapper matchMapper;

  @PostMapping
  public ResponseEntity<String> handleWebhook(@Valid @RequestBody PandaScoreEventDto event) { // Added @Valid
    log.info("Received Webhook Event: {}", event.type());

    if ("match_created".equals(event.type())) {
      var matchDto = event.payload().object();
      log.info("Processing match: {}", matchDto.name());

      // 1. Convert DTO -> Entity
      Match matchEntity = matchMapper.toEntity(matchDto);

      // 2. Save to Postgres
      matchRepository.save(matchEntity);

      log.info("Saved match ID {} to database.", matchEntity.getId());
    }

    return ResponseEntity.ok("Received");
  }
}
