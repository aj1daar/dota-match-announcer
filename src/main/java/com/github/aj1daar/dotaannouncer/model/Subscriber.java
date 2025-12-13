package com.github.aj1daar.dotaannouncer.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "subscribers")
@Data
@NoArgsConstructor
public class Subscriber {

  @Id
  private Long chatId;

  private String firstName;

  private LocalDateTime registeredAt;

  //added for Kotlin code, Lombok and Kotlin are not friends, apparently
  public Subscriber(Long chatId, String firstName, LocalDateTime registeredAt) {
    this.chatId = chatId;
    this.firstName = firstName;
    this.registeredAt = registeredAt;
  }
}