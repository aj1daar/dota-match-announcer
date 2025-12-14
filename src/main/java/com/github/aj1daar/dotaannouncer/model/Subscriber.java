package com.github.aj1daar.dotaannouncer.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "subscribers")
@Data
@NoArgsConstructor
public class Subscriber {

  @Id
  private Long chatId;
  private String firstName;
  private LocalDateTime registeredAt;

  @OneToMany(mappedBy = "subscriber", cascade = CascadeType.ALL, fetch = FetchType.EAGER)
  private List<TeamSubscription> followedTeams;
  @OneToMany(mappedBy = "subscriber", cascade = CascadeType.ALL, fetch = FetchType.EAGER)
  private List<TournamentSubscription> followedTournaments;

  //added for Kotlin code, Lombok and Kotlin are not friends, apparently
  public Subscriber(Long chatId, String firstName, LocalDateTime registeredAt) {
    this.chatId = chatId;
    this.firstName = firstName;
    this.registeredAt = registeredAt;
  }
}