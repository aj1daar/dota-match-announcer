package com.github.aj1daar.dotaannouncer.repository;

import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface TeamSubscriptionRepository extends JpaRepository<TeamSubscription, Long> {

  boolean existsBySubscriberChatIdAndTeamId(Long chatId, Long teamId);
  List<TeamSubscription> findByTeamId(Long teamId);
  List<TeamSubscription> findBySubscriberChatId(Long chatId);
  Optional<TeamSubscription> findBySubscriberChatIdAndTeamId(Long chatId, Long teamId);

  @Modifying
  @Transactional
  @Query("DELETE FROM TeamSubscription ts WHERE ts.subscriber.chatId = :chatId AND ts.teamId = :teamId")
  int deleteBySubscriberChatIdAndTeamId(Long chatId, Long teamId);
}