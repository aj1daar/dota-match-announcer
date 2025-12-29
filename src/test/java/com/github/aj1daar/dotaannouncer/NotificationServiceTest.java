package com.github.aj1daar.dotaannouncer;

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.model.MatchFormat;
import com.github.aj1daar.dotaannouncer.model.Subscriber;
import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository;
import com.github.aj1daar.dotaannouncer.service.NotificationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

  @Mock
  private MatchRepository matchRepository;


  @Mock
  private TeamSubscriptionRepository teamSubscriptionRepository;

  @Mock
  private DotaTelegramBot telegramBot;

  @InjectMocks
  private NotificationService notificationService;

  @Test
  void shouldAnnounceMatches_AndMarkAsAnnounced() {
    Match match = new Match();
    match.setId(100L);
    match.setTeamOne("Team Spirit");
    match.setTeamOneId(1001L);
    match.setTeamTwo("OG");
    match.setTeamTwoId(1002L);
    match.setTournamentName("The International");
    match.setFormat(MatchFormat.valueOf("BO3"));
    match.setStartTime(LocalDateTime.now());
    match.setAnnounced(false);

    Subscriber subscriber = new Subscriber(12345L, "Atai", LocalDateTime.now());

    TeamSubscription teamSubscription = new TeamSubscription();
    teamSubscription.setSubscriber(subscriber);
    teamSubscription.setTeamId(1001L);
    teamSubscription.setTeamName("Team Spirit");

    when(matchRepository.findByAnnouncedFalse()).thenReturn(List.of(match));
    when(teamSubscriptionRepository.findByTeamId(1001L)).thenReturn(List.of(teamSubscription));
    when(teamSubscriptionRepository.findByTeamId(1002L)).thenReturn(List.of());

    notificationService.announceMatches();

    verify(telegramBot, times(1)).sendNotification(eq(12345L), anyString());

    match.setAnnounced(true);
    verify(matchRepository, times(1)).save(match);
  }
}