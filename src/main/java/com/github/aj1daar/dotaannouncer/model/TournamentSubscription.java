package com.github.aj1daar.dotaannouncer.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "tournament_subscriptions")
@Getter @Setter @NoArgsConstructor
public class TournamentSubscription {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long tournamentId; // PandaScore ID
  private String name;       // e.g., "The International 2025"
  private LocalDateTime endAt; // We store this to know when it finishes!

  @ManyToOne
  @JoinColumn(name = "subscriber_id")
  private Subscriber subscriber;

  public TournamentSubscription(Long tournamentId, String name, LocalDateTime endAt, Subscriber subscriber) {
    this.tournamentId = tournamentId;
    this.name = name;
    this.endAt = endAt;
    this.subscriber = subscriber;
  }
}