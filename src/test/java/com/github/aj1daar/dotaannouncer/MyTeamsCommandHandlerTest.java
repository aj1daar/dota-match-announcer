package com.github.aj1daar.dotaannouncer;

import com.github.aj1daar.dotaannouncer.bot.handler.MyTeamsCommandHandler;
import com.github.aj1daar.dotaannouncer.bot.service.NotificationService;
import com.github.aj1daar.dotaannouncer.model.Subscriber;
import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.ObjectProvider;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MyTeamsCommandHandlerTest {

    @Mock
    private TeamSubscriptionRepository teamSubscriptionRepository;

    @Mock
    private ObjectProvider<NotificationService> notificationServiceProvider;

    @Mock
    private NotificationService notificationService;

    private MyTeamsCommandHandler handler;

    private static final Long CHAT_ID = 12345L;

    @BeforeEach
    void setUp() {
        when(notificationServiceProvider.getObject()).thenReturn(notificationService);
        handler = new MyTeamsCommandHandler(teamSubscriptionRepository, notificationServiceProvider);
    }

    @Test
    @DisplayName("Should handle /my_teams command")
    void shouldHandleMyTeamsCommand() {
        assertThat(handler.canHandle("/my_teams")).isTrue();
    }

    @Test
    @DisplayName("Should handle /myteams command (alternate)")
    void shouldHandleMyTeamsAlternateCommand() {
        assertThat(handler.canHandle("/myteams")).isTrue();
    }

    @Test
    @DisplayName("Should not handle other commands")
    void shouldNotHandleOtherCommands() {
        assertThat(handler.canHandle("/start")).isFalse();
        assertThat(handler.canHandle("/help")).isFalse();
        assertThat(handler.canHandle("/search_team")).isFalse();
        assertThat(handler.canHandle("/my_team")).isFalse(); // Missing 's'
    }

    @Test
    @DisplayName("Should show empty message when user has no subscriptions")
    void shouldShowEmptyMessageWhenNoSubscriptions() {
        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(Collections.emptyList());

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        handler.handle(CHAT_ID, "/my_teams");

        verify(teamSubscriptionRepository).findBySubscriberChatId(CHAT_ID);
        verify(notificationService).sendNotification(eq(CHAT_ID), messageCaptor.capture());

        String sentMessage = messageCaptor.getValue();
        assertThat(sentMessage).contains("not following any teams");
        assertThat(sentMessage).contains("/search_team");
    }

    @Test
    @DisplayName("Should show single team subscription")
    void shouldShowSingleTeamSubscription() {
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        TeamSubscription subscription = new TeamSubscription(2411L, "Team Spirit", subscriber);

        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(List.of(subscription));

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);

        handler.handle(CHAT_ID, "/my_teams");

        verify(teamSubscriptionRepository).findBySubscriberChatId(CHAT_ID);
        verify(notificationService).sendNotification(eq(CHAT_ID), messageCaptor.capture());

        String sentMessage = messageCaptor.getValue();
        assertThat(sentMessage).contains("Your Subscribed Teams");
        assertThat(sentMessage).contains("Team Spirit");
        assertThat(sentMessage).contains("2411");
        assertThat(sentMessage).contains("Total: 1 team(s)");
    }

    @Test
    @DisplayName("Should show multiple team subscriptions with numbering")
    void shouldShowMultipleTeamSubscriptions() {
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        TeamSubscription sub1 = new TeamSubscription(2411L, "Team Spirit", subscriber);
        TeamSubscription sub2 = new TeamSubscription(2412L, "OG", subscriber);
        TeamSubscription sub3 = new TeamSubscription(2413L, "Team Liquid", subscriber);

        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(List.of(sub1, sub2, sub3));

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);

        handler.handle(CHAT_ID, "/my_teams");

        verify(teamSubscriptionRepository).findBySubscriberChatId(CHAT_ID);
        verify(notificationService).sendNotification(eq(CHAT_ID), messageCaptor.capture());

        String sentMessage = messageCaptor.getValue();
        assertThat(sentMessage).contains("Your Subscribed Teams");
        assertThat(sentMessage).contains("1. Team Spirit");
        assertThat(sentMessage).contains("2. OG");
        assertThat(sentMessage).contains("3. Team Liquid");
        assertThat(sentMessage).contains("Total: 3 team(s)");
        assertThat(sentMessage).contains("2411");
        assertThat(sentMessage).contains("2412");
        assertThat(sentMessage).contains("2413");
    }

    @Test
    @DisplayName("Should work with /myteams alternate command")
    void shouldWorkWithAlternateCommand() {
        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(Collections.emptyList());

        handler.handle(CHAT_ID, "/myteams");

        verify(teamSubscriptionRepository).findBySubscriberChatId(CHAT_ID);
        verify(notificationService).sendNotification(eq(CHAT_ID), anyString());
    }

    @Test
    @DisplayName("Should handle large number of subscriptions")
    void shouldHandleLargeNumberOfSubscriptions() {
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        List<TeamSubscription> subscriptions = List.of(
                new TeamSubscription(1L, "Team 1", subscriber),
                new TeamSubscription(2L, "Team 2", subscriber),
                new TeamSubscription(3L, "Team 3", subscriber),
                new TeamSubscription(4L, "Team 4", subscriber),
                new TeamSubscription(5L, "Team 5", subscriber),
                new TeamSubscription(6L, "Team 6", subscriber),
                new TeamSubscription(7L, "Team 7", subscriber),
                new TeamSubscription(8L, "Team 8", subscriber),
                new TeamSubscription(9L, "Team 9", subscriber),
                new TeamSubscription(10L, "Team 10", subscriber)
        );

        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(subscriptions);

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);

        handler.handle(CHAT_ID, "/my_teams");

        verify(notificationService).sendNotification(eq(CHAT_ID), messageCaptor.capture());

        String sentMessage = messageCaptor.getValue();
        assertThat(sentMessage).contains("Total: 10 team(s)");
        assertThat(sentMessage).contains("1. Team 1");
        assertThat(sentMessage).contains("10. Team 10");
    }

    @Test
    @DisplayName("Should handle teams with special characters in names")
    void shouldHandleSpecialCharactersInTeamNames() {
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        TeamSubscription subscription = new TeamSubscription(
                1234L,
                "Tundra Esports [EU]",
                subscriber
        );

        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(List.of(subscription));

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);

        handler.handle(CHAT_ID, "/my_teams");

        verify(notificationService).sendNotification(eq(CHAT_ID), messageCaptor.capture());

        String sentMessage = messageCaptor.getValue();
        assertThat(sentMessage).contains("Tundra Esports [EU]");
        assertThat(sentMessage).contains("1234");
    }

    @Test
    @DisplayName("Should call repository exactly once")
    void shouldCallRepositoryExactlyOnce() {
        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(Collections.emptyList());

        handler.handle(CHAT_ID, "/my_teams");

        verify(teamSubscriptionRepository, times(1)).findBySubscriberChatId(CHAT_ID);
    }

    @Test
    @DisplayName("Should send notification exactly once")
    void shouldSendNotificationExactlyOnce() {
        when(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID))
                .thenReturn(Collections.emptyList());

        handler.handle(CHAT_ID, "/my_teams");

        verify(notificationService, times(1)).sendNotification(eq(CHAT_ID), anyString());
    }
}
