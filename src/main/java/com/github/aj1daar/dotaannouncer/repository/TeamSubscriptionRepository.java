package com.github.aj1daar.dotaannouncer.repository;

import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamSubscriptionRepository extends JpaRepository<TeamSubscription, Long> {

  boolean existsBySubscriberChatIdAndTeamId(Long chatId, Long teamId);
}