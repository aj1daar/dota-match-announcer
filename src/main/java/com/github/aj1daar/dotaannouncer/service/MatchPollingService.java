package com.github.aj1daar.dotaannouncer.service;

import com.github.aj1daar.dotaannouncer.dto.PandaScoreMatchDto;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.model.MatchFormat;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class MatchPollingService {

  private final RestClient pandaScoreClient;
  private final MatchRepository matchRepository;

  @Scheduled(fixedRate = 600000) // every 10 minutes
  public void fetchUpcomingMatches() {
    log.info("🌍 Polling PandaScore for upcoming Dota 2 matches...");

    try {
      List<PandaScoreMatchDto> apiMatches = pandaScoreClient.get()
          .uri("/dota2/matches/upcoming?sort=begin_at")
          .retrieve()
          .body(new ParameterizedTypeReference<>() {});

      if (apiMatches == null) return;

      for (PandaScoreMatchDto dto : apiMatches) {
        if (!matchRepository.existsById(dto.id())) {
          Match match = mapToEntity(dto);
          matchRepository.save(match);
          log.info("💾 Saved new match: {}", match.getDisplayName());
        }
      }
    } catch (Exception e) {
      log.error("❌ Failed to fetch matches from PandaScore", e);
    }
  }

  private Match mapToEntity(PandaScoreMatchDto dto) {
    Match match = new Match();
    match.setId(dto.id());
    match.setStartTime(dto.beginAt());
    match.setFormat(MatchFormat.valueOf("BO" + dto.numberOfGames()));

    if (dto.league() != null) {
      match.setTournamentName(dto.league().name());
    }

    if (dto.opponents() != null && !dto.opponents().isEmpty()) {
      var op1 = dto.opponents().getFirst().opponent();
      match.setTeamOneDetails(op1.id(), op1.name());
    }

    if (dto.opponents() != null && dto.opponents().size() >= 2) {
      var op2 = dto.opponents().get(1).opponent();
      match.setTeamTwoDetails(op2.id(), op2.name());
    }

    match.setAnnounced(false);
    return match;
  }
}