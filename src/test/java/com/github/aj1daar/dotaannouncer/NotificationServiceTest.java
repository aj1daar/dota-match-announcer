package com.github.aj1daar.dotaannouncer;

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.model.MatchFormat;
import com.github.aj1daar.dotaannouncer.model.Subscriber;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository;
import com.github.aj1daar.dotaannouncer.service.NotificationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class) // Uses Mockito without loading Spring (Fast!)
class NotificationServiceTest {

  @Mock
  private MatchRepository matchRepository;

  @Mock
  private SubscriberRepository subscriberRepository;

  @Mock
  private DotaTelegramBot telegramBot;

  @InjectMocks
  private NotificationService notificationService;

  @Test
  void shouldAnnounceMatches_AndMarkAsAnnounced() {
    // 1. Arrange (Prepare the fake data)
    Match match = new Match();
    match.setId(100L);
    match.setTeamOne("Team Spirit");
    match.setTeamTwo("OG");
    match.setTournamentName("The International");
    match.setFormat(MatchFormat.valueOf("BO3"));
    match.setStartTime(LocalDateTime.now());
    match.setAnnounced(false); // Important!

    Subscriber subscriber = new Subscriber(12345L, "Atai", LocalDateTime.now());

    // Teach the mocks what to return
    when(matchRepository.findByAnnouncedFalse()).thenReturn(List.of(match));
    when(subscriberRepository.findAll()).thenReturn(List.of(subscriber));

    // 2. Act (Run the method)
    notificationService.announceMatches();

    // 3. Assert (Verify what happened)

    // Verify bot was called with the correct Chat ID
    verify(telegramBot, times(1)).sendNotification(eq(12345L), anyString());

    // Verify the match was saved with 'announced = true'
    match.setAnnounced(true); // We expect the service to have done this
    verify(matchRepository, times(1)).save(match);
  }
}