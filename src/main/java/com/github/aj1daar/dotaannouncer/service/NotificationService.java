package com.github.aj1daar.dotaannouncer.service;

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.model.Subscriber;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository;
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
  private final SubscriberRepository subscriberRepository;

  @Scheduled(fixedRate = 30000)
  @Transactional
  public void announceMatches() {
    List<Match> unannouncedMatches = matchRepository.findByAnnouncedFalse();

    if (unannouncedMatches.isEmpty()) return;
    List<Subscriber> subscribers = subscriberRepository.findAll();

    if (subscribers.isEmpty()) {
      log.info("Matches found, but no subscribers to notify.");
      return;
    }

    log.info("Announcing {} matches to {} subscribers.", unannouncedMatches.size(), subscribers.size());

    for (Match match : unannouncedMatches) {
      String message = formatMessage(match);

      for (Subscriber sub : subscribers) {
        try {
          telegramBot.sendNotification(sub.getChatId(), message);
        } catch (Exception e) {
          log.error("Failed to send to {}", sub.getChatId());
        }
      }

      match.setAnnounced(true);
      matchRepository.save(match);
    }
  }

  private String formatMessage(Match match) {
    DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd MMMM HH:mm");
    return String.format(
        """
        🏆 New Match Announced!

        ⚔️ %s vs %s
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