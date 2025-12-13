package com.github.aj1daar.dotaannouncer.repository;

import com.github.aj1daar.dotaannouncer.model.Subscriber;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubscriberRepository extends JpaRepository<Subscriber, Long> {
}