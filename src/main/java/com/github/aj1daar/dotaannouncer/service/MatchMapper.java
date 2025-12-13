package com.github.aj1daar.dotaannouncer.service;

import com.github.aj1daar.dotaannouncer.dto.PandaScoreMatchDto;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.model.MatchFormat;
import org.springframework.stereotype.Component;

@Component
public class MatchMapper {

  public Match toEntity(PandaScoreMatchDto dto) {
    Match match = new Match();

    match.setId(dto.id());
    match.setTournamentName(dto.league().name());
    match.setStartTime(dto.beginAt());
    match.setAnnounced(false);

    match.setFormat(MatchFormat.fromGameCount(dto.numberOfGames()));

    parseTeams(dto.name(), match);

    return match;
  }

  private void parseTeams(String matchName, Match match) {
    if (matchName != null && matchName.contains(" vs ")) {
      String[] parts = matchName.split(" vs ");
      match.setTeamOne(parts[0].trim());
      match.setTeamTwo(parts[1].trim());
    } else {
      // Fallback if name is weird (e.g. "TBD")
      match.setTeamOne("TBD");
      match.setTeamTwo("TBD");
    }
  }
}
