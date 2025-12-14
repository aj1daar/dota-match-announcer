package com.github.aj1daar.dotaannouncer.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "team_subscriptions")
@Getter @Setter @NoArgsConstructor
public class TeamSubscription {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long teamId;      // PandaScore ID (e.g., 1234)
  private String teamName;  // e.g., "Team Spirit"

  @ManyToOne
  @JoinColumn(name = "subscriber_id")
  private Subscriber subscriber;

  public TeamSubscription(Long teamId, String teamName, Subscriber subscriber) {
    this.teamId = teamId;
    this.teamName = teamName;
    this.subscriber = subscriber;
  }
}