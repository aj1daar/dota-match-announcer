package com.github.aj1daar.dotaannouncer.service;

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

  private final MatchRepository matchRepository;
  private final DotaTelegramBot telegramBot;
  private final TeamSubscriptionRepository teamSubscriptionRepository;

  @Scheduled(fixedRate = 30000)
  @Transactional
  public void announceMatches() {
    List<Match> unannouncedMatches = matchRepository.findByAnnouncedFalse();

    for (Match match : unannouncedMatches) {
      Set<Long> subscriberIds = findSubscribersForMatch(match);

      if (!subscriberIds.isEmpty()) {
        String message = formatMessage(match);

        for  (Long subscriberId : subscriberIds) {
          try {
            telegramBot.sendNotification(subscriberId, message);
          } catch (Exception e) {
            log.error("Failed to send to {}", subscriberId);
          }
        }
      }

      match.setAnnounced(true);
      matchRepository.save(match);
      if (!subscriberIds.isEmpty()) {
        log.info("Announced match {} to {} subscribers", match.getId(), subscriberIds.size());
      }
    }
  }

  private Set<Long> findSubscribersForMatch(Match match) {
    Set<Long> chatIds = new HashSet<>();

    if (match.getTeamOneId() != null) {
      List<TeamSubscription> subs1 = teamSubscriptionRepository.findByTeamId(match.getTeamOneId());
      subs1.forEach(sub -> chatIds.add(sub.getSubscriber().getChatId()));
    }

    if (match.getTeamTwoId() != null) {
      List<TeamSubscription> subs2 = teamSubscriptionRepository.findByTeamId(match.getTeamTwoId());
      subs2.forEach(sub -> chatIds.add(sub.getSubscriber().getChatId()));
    }

    return chatIds;
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