package com.github.aj1daar.dotaannouncer.service;

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

  private final MatchRepository matchRepository;
  private final DotaTelegramBot telegramBot;

  // Hardcoded Chat ID for now
  // TODO: store ID of chats in the database
  private final long MY_CHAT_ID = 123123123L; // Don't forget the 'L' at the end!

  @Scheduled(fixedRate = 30000)
  @Transactional
  public void announceMatches() {
    List<Match> unannouncedMatches = matchRepository.findByAnnouncedFalse();

    if (unannouncedMatches.isEmpty()) {
      return;
    }

    log.info("Found {} matches to announce.", unannouncedMatches.size());

    for (Match match : unannouncedMatches) {
      String message = formatMessage(match);


      telegramBot.sendNotification(MY_CHAT_ID, message);

      match.setAnnounced(true);
      matchRepository.save(match);
    }
  }

  private String formatMessage(Match match) {
    DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd MMMM HH:mm");
    return String.format(
        """
        🏆 **New Match Announced!**

        ⚔️ **%s** vs **%s**
        🏆 Tournament: %s
        📊 Format: %s
        ⏰ Start: %s
        """,
        match.getTeamOne(),
        match.getTeamTwo(),
        match.getTournamentName(),
        match.getFormat(),
        match.getStartTime().format(formatter)
    );
  }
}