package com.github.aj1daar.dotaannouncer.repository;

import com.github.aj1daar.dotaannouncer.model.TeamSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface TeamSubscriptionRepository extends JpaRepository<TeamSubscription, Long> {

  boolean existsBySubscriberChatIdAndTeamId(Long chatId, Long teamId);
  List<TeamSubscription> findByTeamId(Long teamId);
  List<TeamSubscription> findBySubscriberChatId(Long chatId);

  @Transactional
  void deleteBySubscriberChatIdAndTeamId(Long chatId, Long teamId);
}