package com.github.aj1daar.dotaannouncer;

import com.github.aj1daar.dotaannouncer.bot.handler.CallbackHandler;
import com.github.aj1daar.dotaannouncer.bot.service.NotificationService;
import com.github.aj1daar.dotaannouncer.model.Subscriber;
import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CallbackHandlerTest {

    @Mock
    private SubscriberRepository subscriberRepository;

    @Mock
    private TeamSubscriptionRepository teamSubscriptionRepository;

    @Mock
    private ObjectProvider<NotificationService> notificationServiceProvider;

    @Mock
    private NotificationService notificationService;

    private CallbackHandler handler;

    private static final Long CHAT_ID = 12345L;
    private static final Long TEAM_ID = 2411L;
    private static final String TEAM_NAME = "Team Spirit";

    @BeforeEach
    void setUp() {
        when(notificationServiceProvider.getObject()).thenReturn(notificationService);
        handler = new CallbackHandler(subscriberRepository, teamSubscriptionRepository, notificationServiceProvider);
    }

    @Test
    @DisplayName("Should subscribe to team when user is not already subscribed")
    void shouldSubscribeToTeamWhenNotAlreadySubscribed() {
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        when(subscriberRepository.findById(CHAT_ID)).thenReturn(Optional.of(subscriber));
        when(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID)).thenReturn(false);

        handler.handleCallback(CHAT_ID, "SUB_TEAM:" + TEAM_ID + ":" + TEAM_NAME);

        ArgumentCaptor<TeamSubscription> subscriptionCaptor = ArgumentCaptor.forClass(TeamSubscription.class);
        verify(teamSubscriptionRepository).save(subscriptionCaptor.capture());

        TeamSubscription savedSubscription = subscriptionCaptor.getValue();
        assertThat(savedSubscription.getTeamId()).isEqualTo(TEAM_ID);
        assertThat(savedSubscription.getTeamName()).isEqualTo(TEAM_NAME);
        assertThat(savedSubscription.getSubscriber()).isEqualTo(subscriber);

        verify(notificationService).sendNotification(eq(CHAT_ID), contains("now following"));
        verify(notificationService).sendNotification(eq(CHAT_ID), contains(TEAM_NAME));
    }

    @Test
    @DisplayName("Should not subscribe when user is already subscribed")
    void shouldNotSubscribeWhenAlreadySubscribed() {
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        when(subscriberRepository.findById(CHAT_ID)).thenReturn(Optional.of(subscriber));
        when(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID)).thenReturn(true);

        handler.handleCallback(CHAT_ID, "SUB_TEAM:" + TEAM_ID + ":" + TEAM_NAME);

        verify(teamSubscriptionRepository, never()).save(any());
        verify(notificationService).sendNotification(eq(CHAT_ID), contains("already following"));
        verify(notificationService).sendNotification(eq(CHAT_ID), contains(TEAM_NAME));
    }

    @Test
    @DisplayName("Should unsubscribe from team when user is subscribed")
    void shouldUnsubscribeFromTeamWhenSubscribed() {
        TeamSubscription subscription = new TeamSubscription(TEAM_ID, TEAM_NAME, new Subscriber(CHAT_ID, "User", LocalDateTime.now()));
        when(teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID)).thenReturn(Optional.of(subscription));

        handler.handleCallback(CHAT_ID, "UNSUB_TEAM:" + TEAM_ID);

        verify(teamSubscriptionRepository).deleteBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID);
        verify(notificationService).sendNotification(eq(CHAT_ID), contains("unfollowed"));
        verify(notificationService).sendNotification(eq(CHAT_ID), contains(TEAM_NAME));
    }

    @Test
    @DisplayName("Should handle unsubscribe when user is not subscribed")
    void shouldHandleUnsubscribeWhenNotSubscribed() {
        when(teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID)).thenReturn(Optional.empty());

        handler.handleCallback(CHAT_ID, "UNSUB_TEAM:" + TEAM_ID);

        verify(teamSubscriptionRepository, never()).deleteBySubscriberChatIdAndTeamId(anyLong(), anyLong());
        verify(notificationService).sendNotification(eq(CHAT_ID), contains("not following"));
    }

    @Test
    @DisplayName("Should verify deleteBySubscriberChatIdAndTeamId is called with correct parameters")
    void shouldCallDeleteWithCorrectParameters() {
        TeamSubscription subscription = new TeamSubscription(TEAM_ID, TEAM_NAME, new Subscriber(CHAT_ID, "User", LocalDateTime.now()));
        when(teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID)).thenReturn(Optional.of(subscription));

        handler.handleCallback(CHAT_ID, "UNSUB_TEAM:" + TEAM_ID);

        verify(teamSubscriptionRepository, times(1)).deleteBySubscriberChatIdAndTeamId(eq(CHAT_ID), eq(TEAM_ID));
    }

    @Test
    @DisplayName("Should handle malformed UNSUB_TEAM callback data")
    void shouldHandleMalformedUnsubCallbackData() {
        handler.handleCallback(CHAT_ID, "UNSUB_TEAM:invalid");

        verify(teamSubscriptionRepository, never()).deleteBySubscriberChatIdAndTeamId(anyLong(), anyLong());
        verify(notificationService, never()).sendNotification(anyLong(), anyString());
    }

    @Test
    @DisplayName("Should handle malformed SUB_TEAM callback data")
    void shouldHandleMalformedSubCallbackData() {
        handler.handleCallback(CHAT_ID, "SUB_TEAM:invalid");

        verify(teamSubscriptionRepository, never()).save(any());
        verify(notificationService, never()).sendNotification(anyLong(), anyString());
    }

    @Test
    @DisplayName("Should handle unsubscribe for team with special characters in name")
    void shouldHandleUnsubscribeWithSpecialCharactersInTeamName() {
        Long specialTeamId = 1234L;
        String specialTeamName = "Tundra Esports [EU]";
        TeamSubscription subscription = new TeamSubscription(specialTeamId, specialTeamName, new Subscriber(CHAT_ID, "User", LocalDateTime.now()));
        when(teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(CHAT_ID, specialTeamId)).thenReturn(Optional.of(subscription));

        handler.handleCallback(CHAT_ID, "UNSUB_TEAM:" + specialTeamId);

        verify(teamSubscriptionRepository).deleteBySubscriberChatIdAndTeamId(CHAT_ID, specialTeamId);
        verify(notificationService).sendNotification(eq(CHAT_ID), contains(specialTeamName));
    }

    @Test
    @DisplayName("Should not process unknown callback types")
    void shouldNotProcessUnknownCallbackTypes() {
        handler.handleCallback(CHAT_ID, "UNKNOWN_CALLBACK:123:test");

        verify(teamSubscriptionRepository, never()).deleteBySubscriberChatIdAndTeamId(anyLong(), anyLong());
        verify(teamSubscriptionRepository, never()).save(any());
        verify(notificationService, never()).sendNotification(anyLong(), anyString());
    }

    @Test
    @DisplayName("Should handle multiple unsubscribe operations")
    void shouldHandleMultipleUnsubscribeOperations() {
        Long teamId1 = 100L;
        Long teamId2 = 200L;
        String teamName1 = "Team A";
        String teamName2 = "Team B";

        TeamSubscription sub1 = new TeamSubscription(teamId1, teamName1, new Subscriber(CHAT_ID, "User", LocalDateTime.now()));
        TeamSubscription sub2 = new TeamSubscription(teamId2, teamName2, new Subscriber(CHAT_ID, "User", LocalDateTime.now()));

        when(teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(CHAT_ID, teamId1)).thenReturn(Optional.of(sub1));
        when(teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(CHAT_ID, teamId2)).thenReturn(Optional.of(sub2));

        handler.handleCallback(CHAT_ID, "UNSUB_TEAM:" + teamId1);
        handler.handleCallback(CHAT_ID, "UNSUB_TEAM:" + teamId2);

        verify(teamSubscriptionRepository).deleteBySubscriberChatIdAndTeamId(CHAT_ID, teamId1);
        verify(teamSubscriptionRepository).deleteBySubscriberChatIdAndTeamId(CHAT_ID, teamId2);
        verify(notificationService, times(2)).sendNotification(eq(CHAT_ID), anyString());
    }
}
