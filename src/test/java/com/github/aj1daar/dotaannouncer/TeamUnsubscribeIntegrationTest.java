package com.github.aj1daar.dotaannouncer;

import com.github.aj1daar.dotaannouncer.model.Subscriber;
import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository;
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
@Transactional
class TeamUnsubscribeIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:latest")
            .withDatabaseName("test")
            .withUsername("test")
            .withPassword("test");

    @Autowired
    private SubscriberRepository subscriberRepository;

    @Autowired
    private TeamSubscriptionRepository teamSubscriptionRepository;

    private static final Long CHAT_ID = 99999L;
    private static final Long TEAM_ID_1 = 2411L;
    private static final Long TEAM_ID_2 = 2412L;
    private static final String TEAM_NAME_1 = "Team Spirit";
    private static final String TEAM_NAME_2 = "OG";

    @BeforeEach
    void setUp() {
        teamSubscriptionRepository.deleteAll();
        subscriberRepository.deleteAll();
    }

    @Test
    @DisplayName("Should successfully delete team subscription from database")
    void shouldDeleteTeamSubscriptionFromDatabase() {
        // Given: A subscriber with a team subscription
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        subscriberRepository.save(subscriber);

        TeamSubscription subscription = new TeamSubscription(TEAM_ID_1, TEAM_NAME_1, subscriber);
        teamSubscriptionRepository.save(subscription);

        // Verify subscription exists
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1)).isTrue();

        // When: Unsubscribing from the team
        teamSubscriptionRepository.deleteBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1);

        // Then: Subscription should be removed
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1)).isFalse();
        assertThat(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID)).isEmpty();
    }

    @Test
    @DisplayName("Should delete only the specified team subscription, not all subscriptions")
    void shouldDeleteOnlySpecifiedTeamSubscription() {
        // Given: A subscriber with multiple team subscriptions
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        subscriberRepository.save(subscriber);

        TeamSubscription subscription1 = new TeamSubscription(TEAM_ID_1, TEAM_NAME_1, subscriber);
        TeamSubscription subscription2 = new TeamSubscription(TEAM_ID_2, TEAM_NAME_2, subscriber);
        teamSubscriptionRepository.save(subscription1);
        teamSubscriptionRepository.save(subscription2);

        // Verify both subscriptions exist
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1)).isTrue();
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_2)).isTrue();

        // When: Unsubscribing from only one team
        teamSubscriptionRepository.deleteBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1);

        // Then: Only the specified subscription should be removed
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1)).isFalse();
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_2)).isTrue();

        List<TeamSubscription> remainingSubscriptions = teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID);
        assertThat(remainingSubscriptions).hasSize(1);
        assertThat(remainingSubscriptions.get(0).getTeamId()).isEqualTo(TEAM_ID_2);
        assertThat(remainingSubscriptions.get(0).getTeamName()).isEqualTo(TEAM_NAME_2);
    }

    @Test
    @DisplayName("Should not throw exception when deleting non-existent subscription")
    void shouldNotThrowExceptionWhenDeletingNonExistentSubscription() {
        // Given: A subscriber with no subscriptions
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        subscriberRepository.save(subscriber);

        // When: Attempting to delete a non-existent subscription
        // Then: Should not throw an exception
        teamSubscriptionRepository.deleteBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1);

        // Verify no subscriptions exist
        assertThat(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID)).isEmpty();
    }

    @Test
    @DisplayName("Should persist deletion across multiple queries")
    void shouldPersistDeletionAcrossMultipleQueries() {
        // Given: A subscriber with a team subscription
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        subscriberRepository.save(subscriber);

        TeamSubscription subscription = new TeamSubscription(TEAM_ID_1, TEAM_NAME_1, subscriber);
        teamSubscriptionRepository.save(subscription);

        // When: Deleting the subscription
        teamSubscriptionRepository.deleteBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1);
        teamSubscriptionRepository.flush(); // Force persistence

        // Then: Multiple queries should confirm deletion
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, TEAM_ID_1)).isFalse();
        assertThat(teamSubscriptionRepository.findBySubscriberChatId(CHAT_ID)).isEmpty();
        assertThat(teamSubscriptionRepository.findByTeamId(TEAM_ID_1)).isEmpty();
    }

    @Test
    @DisplayName("Should handle deletion with special characters in team name")
    void shouldHandleDeletionWithSpecialCharactersInTeamName() {
        // Given: A subscriber with a team that has special characters
        Subscriber subscriber = new Subscriber(CHAT_ID, "TestUser", LocalDateTime.now());
        subscriberRepository.save(subscriber);

        Long specialTeamId = 1234L;
        String specialTeamName = "Tundra Esports [EU] & Co.";
        TeamSubscription subscription = new TeamSubscription(specialTeamId, specialTeamName, subscriber);
        teamSubscriptionRepository.save(subscription);

        // When: Deleting the subscription
        teamSubscriptionRepository.deleteBySubscriberChatIdAndTeamId(CHAT_ID, specialTeamId);

        // Then: Subscription should be removed
        assertThat(teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(CHAT_ID, specialTeamId)).isFalse();
    }
}
